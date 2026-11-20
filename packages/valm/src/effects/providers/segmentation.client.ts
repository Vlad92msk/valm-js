import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { DeviceDetector } from '../../core'
import { loadTasksVision } from './mediapipe-loader'

export interface SegmentationConfig {
  // default: GPU на десктопе, CPU на мобильных
  delegate?: 'GPU' | 'CPU'
  wasmPath?: string
  modelPath?: string
  disableOnMobile?: boolean
  // Маска остаётся текстурой WebGL, композиция идёт в том же контексте — без чтения маски
  // с GPU на основной поток. false — старый путь (маска читается в Uint8Array каждый раз).
  // default: true
  gpuMask?: boolean
}

// Маска как текстура WebGL2: confidence человека в канале R (0..1), начало координат — как у
// текстур, загруженных с UNPACK_FLIP_Y_WEBGL. Живёт до следующей сегментации этого провайдера.
export interface SegmentationGpuMask {
  gl: WebGL2RenderingContext
  texture: WebGLTexture
}

export interface SegmentationResult {
  // 0 = человек (foreground), 255 = фон (background).
  // Если есть gpuMask — считается лениво при первом чтении (чтение с GPU, дорого)
  maskData: Uint8Array
  width: number
  height: number
  timestamp: number
  // Есть, когда маска осталась на GPU (встроенный провайдер, gpuMask !== false)
  gpuMask?: SegmentationGpuMask
}

// Кадр для сегментации без копирования в ImageData
export type SegmentationSource = HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement | ImageBitmap | VideoFrame

type ConfidenceMask = {
  getAsFloat32Array(): Float32Array
  getAsWebGLTexture(): WebGLTexture
  hasWebGLTexture(): boolean
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas
  width: number
  height: number
}

type HeldResult = { close(): void }

function getDefaultConfig(): Required<SegmentationConfig> {
  const isMobile = DeviceDetector.isMobile()

  return {
    // На мобильных CPU стабильнее GPU
    delegate: isMobile ? 'CPU' : 'GPU',
    wasmPath: '/mediapipe/wasm',
    modelPath: '/mediapipe/models/selfie_segmenter.tflite',
    disableOnMobile: false,
    gpuMask: true,
  }
}

function createGlCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1)
  if (typeof document !== 'undefined') return document.createElement('canvas')
  return null
}

export class SegmentationService {
  private segmenter: ImageSegmenter | null = null
  private initialized = false
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private lastTimestamp = 0
  private initializationError: Error | null = null
  private isMobile = false
  private isIOS = false
  private pendingSegmentations = 0

  // GPU-путь: свой canvas для WebGL-контекста MediaPipe, в нём же идёт композиция эффектов
  private glCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private gl: WebGL2RenderingContext | null = null
  // Результат прошлой сегментации держим до следующей: его текстура используется в кадрах-кэшах
  private heldResult: HeldResult | null = null

  async initialize(config: SegmentationConfig = {}): Promise<void> {
    if (this.initialized) {
      console.warn('[SegmentationService] Already initialized')
      return
    }

    this.isMobile = DeviceDetector.isMobile()
    this.isIOS = DeviceDetector.isIOS()

    // Может быть отключено на мобильных
    if (config.disableOnMobile && this.isMobile) {
      this.initializationError = new Error('Disabled on mobile')
      return
    }

    const defaultConfig = getDefaultConfig()
    const finalConfig = { ...defaultConfig, ...config }

    try {
      const { FilesetResolver, ImageSegmenter } = await loadTasksVision()

      const visionPromise = FilesetResolver.forVisionTasks(finalConfig.wasmPath)
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('WASM load timeout')), 15000))

      const vision = (await Promise.race([visionPromise, timeoutPromise])) as any

      const options = {
        baseOptions: {
          modelAssetPath: finalConfig.modelPath,
          delegate: finalConfig.delegate,
        },
        runningMode: 'VIDEO' as const,
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }

      const glCanvas = finalConfig.gpuMask ? this.createSharedContext() : null
      if (glCanvas) {
        try {
          this.segmenter = await ImageSegmenter.createFromOptions(vision, { ...options, canvas: glCanvas })
        } catch (error) {
          console.warn('[SegmentationService] GPU mask path unavailable, fallback to CPU mask:', error)
          this.releaseSharedContext()
        }
      }

      if (!this.segmenter) {
        this.segmenter = await ImageSegmenter.createFromOptions(vision, options)
      }

      this.initialized = true
    } catch (error) {
      console.error('[SegmentationService] Initialization failed:', error)
      this.initializationError = error as Error

      // На мобильных НЕ бросаем ошибку, просто логируем
      if (!this.isMobile) {
        throw error
      }
    }
  }

  async segment(imageData: ImageData, timestamp: number): Promise<SegmentationResult> {
    // Не инициализирован или есть ошибка — пустая маска
    if (!this.segmenter || !this.initialized || this.initializationError) {
      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }

    // На мобильных не накапливаем pending вызовы — пропускаем вместо "призраков"
    if (this.isMobile && this.pendingSegmentations > 0) {
      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }

    try {
      this.ensureCanvas(imageData.width, imageData.height)

      if (!this.ctx || !this.canvas) {
        throw new Error('Failed to create canvas context')
      }

      this.ctx.putImageData(imageData, 0, 0)

      // Монотонно возрастающий timestamp
      this.lastTimestamp = Math.max(this.lastTimestamp + 1, Math.floor(timestamp))

      this.pendingSegmentations++
      const result = this.segmenter.segmentForVideo(this.canvas, this.lastTimestamp)
      this.pendingSegmentations--

      const confidenceMasks = result.confidenceMasks

      if (!confidenceMasks || confidenceMasks.length === 0) {
        result.close()
        return this.getEmptyMask(imageData.width, imageData.height, timestamp)
      }

      const confidenceMask = confidenceMasks[0]
      const maskData = this.convertConfidenceMask(confidenceMask, imageData.width, imageData.height)

      result.close()

      return {
        maskData,
        width: imageData.width,
        height: imageData.height,
        timestamp,
      }
    } catch (error) {
      this.pendingSegmentations = Math.max(0, this.pendingSegmentations - 1)
      console.error('[SegmentationService] Segmentation error:', error)

      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }
  }

  // Сегментация прямо из canvas/видео/VideoFrame: без getImageData/putImageData.
  // На GPU-пути маска не читается на CPU (maskData — ленивое поле)
  segmentSource(source: SegmentationSource, width: number, height: number, timestamp: number): SegmentationResult {
    if (!this.segmenter || !this.initialized || this.initializationError) {
      return this.getEmptyMask(width, height, timestamp)
    }

    try {
      this.lastTimestamp = Math.max(this.lastTimestamp + 1, Math.floor(timestamp))
      const result = this.segmenter.segmentForVideo(source, this.lastTimestamp)
      const confidenceMasks = result.confidenceMasks

      if (!confidenceMasks || confidenceMasks.length === 0) {
        result.close()
        return this.getEmptyMask(width, height, timestamp)
      }

      const mask = confidenceMasks[0] as unknown as ConfidenceMask

      if (!this.gl) {
        const maskData = this.convertConfidenceMask(mask, width, height)
        result.close()
        return { maskData, width, height, timestamp }
      }

      // Прошлую маску освобождаем только сейчас: до этого её текстура нужна кадрам из кэша
      this.releaseHeldResult()
      this.heldResult = result

      return this.createGpuResult(result, mask, this.gl, width, height, timestamp)
    } catch (error) {
      console.error('[SegmentationService] Segmentation error:', error)
      return this.getEmptyMask(width, height, timestamp)
    }
  }

  dispose(): void {
    this.releaseHeldResult()

    if (this.segmenter) {
      try {
        this.segmenter.close()
      } catch (error) {
        console.error('[SegmentationService] Dispose error:', error)
      }
      this.segmenter = null
    }

    this.canvas = null
    this.ctx = null
    this.releaseSharedContext()
    this.initialized = false
    this.initializationError = null
    this.pendingSegmentations = 0
  }

  isReady(): boolean {
    return this.initialized && !this.initializationError
  }

  getInitializationError(): Error | null {
    return this.initializationError
  }

  private createSharedContext(): HTMLCanvasElement | OffscreenCanvas | null {
    const canvas = createGlCanvas()
    if (!canvas) return null

    // Контекст создаём сами: MediaPipe возьмёт этот же (getContext вернёт существующий).
    // preserveDrawingBuffer — чтобы кадр композиции можно было скопировать в 2D-canvas в любой момент
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGL2RenderingContext | null

    if (!gl) return null

    this.glCanvas = canvas
    this.gl = gl
    return canvas
  }

  private releaseSharedContext(): void {
    this.gl = null
    this.glCanvas = null
  }

  private releaseHeldResult(): void {
    if (!this.heldResult) return
    try {
      this.heldResult.close()
    } catch {
      // результат уже закрыт вместе с сегментером
    }
    this.heldResult = null
  }

  private createGpuResult(
    held: HeldResult,
    mask: ConfidenceMask,
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    timestamp: number,
  ): SegmentationResult {
    // Маска должна жить в нашем контексте; иначе — обычное чтение
    if (mask.canvas !== this.glCanvas) {
      const maskData = this.convertConfidenceMask(mask, width, height)
      return { maskData, width, height, timestamp }
    }

    const texture = mask.getAsWebGLTexture()
    let cached: Uint8Array | null = null

    const result: SegmentationResult = {
      width,
      height,
      timestamp,
      gpuMask: { gl, texture },
      maskData: undefined as unknown as Uint8Array,
    }

    // Uint8Array — только по требованию (кастомный эффект читает segmentationMask)
    Object.defineProperty(result, 'maskData', {
      enumerable: true,
      configurable: true,
      get: () => {
        if (cached) return cached
        if (this.heldResult !== held) {
          // Маска уже освобождена — отдаём «весь кадр фон»
          cached = this.getEmptyMask(width, height, timestamp).maskData
        } else {
          cached = this.convertConfidenceMask(mask, width, height)
        }
        return cached
      },
    })

    return result
  }

  private getEmptyMask(width: number, height: number, timestamp: number): SegmentationResult {
    const emptyMask = new Uint8Array(width * height)
    emptyMask.fill(255) // Весь кадр = фон

    return {
      maskData: emptyMask,
      width,
      height,
      timestamp,
    }
  }

  private ensureCanvas(width: number, height: number): void {
    if (this.canvas && this.canvas.width === width && this.canvas.height === height) {
      return
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })
  }

  // confidence (0.0–1.0) → бинарная маска (0 = person, 255 = background)
  private convertConfidenceMask(
    confidenceMask: {
      getAsFloat32Array(): Float32Array
      width: number
      height: number
    },
    width: number,
    height: number,
  ): Uint8Array {
    const length = width * height
    const result = new Uint8Array(length)

    const rawMask = confidenceMask.getAsFloat32Array()
    const threshold = 0.5

    for (let i = 0; i < length; i++) {
      result[i] = rawMask[i] > threshold ? 0 : 255
    }

    return result
  }
}
