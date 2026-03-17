import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { DeviceDetector } from '../../core'

export interface SegmentationConfig {
  // default: GPU на десктопе, CPU на мобильных
  delegate?: 'GPU' | 'CPU'
  wasmPath?: string
  modelPath?: string
  disableOnMobile?: boolean
}

export interface SegmentationResult {
  // 0 = человек (foreground), 255 = фон (background)
  maskData: Uint8Array
  width: number
  height: number
  timestamp: number
}

function getDefaultConfig(): Required<SegmentationConfig> {
  const isMobile = DeviceDetector.isMobile()

  return {
    // На мобильных CPU стабильнее GPU
    delegate: isMobile ? 'CPU' : 'GPU',
    wasmPath: '/mediapipe/wasm',
    modelPath: '/mediapipe/models/selfie_segmenter.tflite',
    disableOnMobile: false,
  }
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
      const visionPromise = FilesetResolver.forVisionTasks(finalConfig.wasmPath)
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('WASM load timeout')), 15000))

      const vision = (await Promise.race([visionPromise, timeoutPromise])) as any

      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: finalConfig.modelPath,
          delegate: finalConfig.delegate,
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      })

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

  dispose(): void {
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
      getAsUint8Array?(): Uint8Array
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
