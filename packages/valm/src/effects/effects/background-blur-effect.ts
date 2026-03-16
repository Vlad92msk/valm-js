import { DeviceDetector } from '../../core/utils/device-detector'
import { EffectFeature, EffectType, FrameContext } from '../types'
import { BaseEffect } from './base-effect'

export enum BlurMode {
  BACKGROUND = 'background',
  FOREGROUND = 'foreground',
}

export interface BackgroundBlurParams {
  intensity: number
  mode: BlurMode
  edgeSmoothing: boolean
  smoothingThreshold: number
}

export const BLUR_PRESETS = {
  HIGH_QUALITY: {
    edgeSmoothing: true,
    smoothingThreshold: 0.5,
  },
  BALANCED: {
    edgeSmoothing: true,
    smoothingThreshold: 0.6,
  },
  PERFORMANCE: {
    edgeSmoothing: false,
    smoothingThreshold: 0.7,
  },
} as const

const DEFAULT_PARAMS: BackgroundBlurParams = {
  intensity: 0.7,
  mode: BlurMode.BACKGROUND,
  ...BLUR_PRESETS.BALANCED,
}

/**
 * Определить поддержку CSS filter
 */
function supportsFilterBlur(): boolean {
  if (DeviceDetector.isMobile()) {
    // На iOS Safari filter работает, но плохо
    return !DeviceDetector.isIOS()
  }

  // На десктопе всегда используем CSS filter (быстрее)
  return true
}

export class BackgroundBlurEffect extends BaseEffect<BackgroundBlurParams> {
  readonly name = 'background_blur'
  readonly type = EffectType.BACKGROUND_BLUR
  readonly requiredFeatures: EffectFeature[] = [EffectFeature.SEGMENTATION]

  private blurCanvas: HTMLCanvasElement | null = null
  private blurCtx: CanvasRenderingContext2D | null = null
  private tempCanvas: HTMLCanvasElement | null = null
  private tempCtx: CanvasRenderingContext2D | null = null

  private lastWidth = 0
  private lastHeight = 0

  // Выбор алгоритма при создании
  private useFilterBlur: boolean
  // Максимальный радиус blur, управляется pipeline через quality presets
  private maxBlurRadius = 20

  constructor(params: Partial<BackgroundBlurParams> = {}) {
    super({ ...DEFAULT_PARAMS, ...params })
    this.useFilterBlur = supportsFilterBlur()
  }

  setBlurRadius(radius: number): void {
    this.maxBlurRadius = radius
  }

  apply(ctx: FrameContext): void {
    if (!this.enabled) return

    const { sourceCanvas, outputCtx, width, height, segmentationMask } = ctx

    if (!segmentationMask) {
      outputCtx.drawImage(sourceCanvas, 0, 0)
      return
    }

    this.ensureCanvases(width, height)
    if (!this.blurCtx || !this.tempCtx || !this.blurCanvas || !this.tempCanvas) return

    // Применяем размытие разными способами
    if (this.useFilterBlur) {
      this.applyFilterBlur(sourceCanvas, width, height)
    } else {
      this.applyBoxBlurOptimized(sourceCanvas, width, height)
    }

    // Рисуем размытый фон на output
    outputCtx.drawImage(this.blurCanvas, 0, 0, width, height)

    // Накладываем чёткую область по маске
    const sourceImageData = ctx.sourceCtx.getImageData(0, 0, width, height)
    const outputImageData = outputCtx.getImageData(0, 0, width, height)

    this.applyMaskHard(sourceImageData.data, outputImageData.data, segmentationMask, width, height)

    outputCtx.putImageData(outputImageData, 0, 0)
  }

  dispose(): void {
    if (this.blurCanvas) {
      this.blurCanvas.width = 0
      this.blurCanvas.height = 0
      this.blurCanvas = null
    }

    if (this.tempCanvas) {
      this.tempCanvas.width = 0
      this.tempCanvas.height = 0
      this.tempCanvas = null
    }

    this.blurCtx = null
    this.tempCtx = null
  }

  // ============================================
  // Private - Blur Methods
  // ============================================

  /**
   * CSS filter blur (быстро, для десктопа)
   */
  private applyFilterBlur(sourceCanvas: HTMLCanvasElement, width: number, height: number): void {
    if (!this.blurCtx || !this.blurCanvas) return

    const blurAmount = Math.round(this.params.intensity * this.maxBlurRadius)
    this.blurCtx.filter = `blur(${blurAmount}px)`
    this.blurCtx.drawImage(sourceCanvas, 0, 0, width, height)
    this.blurCtx.filter = 'none'
  }

  /**
   * Оптимизированный box blur (для мобильных)
   * - Используем downscale/upscale для ускорения
   * - Меньше радиус для производительности
   */
  private applyBoxBlurOptimized(sourceCanvas: HTMLCanvasElement, width: number, height: number): void {
    if (!this.blurCtx || !this.tempCtx || !this.blurCanvas || !this.tempCanvas) return

    // Downscale для ускорения (размываем маленькое изображение)
    const scale = 0.3
    const smallWidth = Math.floor(width * scale)
    const smallHeight = Math.floor(height * scale)

    // Рисуем уменьшенную версию
    this.tempCtx.drawImage(sourceCanvas, 0, 0, smallWidth, smallHeight)
    const imageData = this.tempCtx.getImageData(0, 0, smallWidth, smallHeight)

    // Применяем blur с меньшим радиусом
    const blurRadius = Math.round(this.params.intensity * Math.ceil(this.maxBlurRadius / 4))
    this.applyBoxBlur(imageData, smallWidth, smallHeight, blurRadius)

    // Кладём обратно на temp canvas
    this.tempCtx.putImageData(imageData, 0, 0)

    // Upscale обратно на blur canvas (браузер сделает интерполяцию)
    this.blurCtx.imageSmoothingEnabled = true
    this.blurCtx.imageSmoothingQuality = 'high'
    this.blurCtx.drawImage(this.tempCanvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height)
  }

  /**
   * Box blur алгоритм
   */
  private applyBoxBlur(imageData: ImageData, width: number, height: number, radius: number): void {
    if (radius < 1) return

    const data = imageData.data
    const tempData = new Uint8ClampedArray(data)

    // Горизонтальный проход
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0

        for (let kx = -radius; kx <= radius; kx++) {
          const nx = x + kx
          if (nx >= 0 && nx < width) {
            const idx = (y * width + nx) * 4
            r += tempData[idx]
            g += tempData[idx + 1]
            b += tempData[idx + 2]
            count++
          }
        }

        const idx = (y * width + x) * 4
        data[idx] = r / count
        data[idx + 1] = g / count
        data[idx + 2] = b / count
      }
    }

    tempData.set(data)

    // Вертикальный проход
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0

        for (let ky = -radius; ky <= radius; ky++) {
          const ny = y + ky
          if (ny >= 0 && ny < height) {
            const idx = (ny * width + x) * 4
            r += tempData[idx]
            g += tempData[idx + 1]
            b += tempData[idx + 2]
            count++
          }
        }

        const idx = (y * width + x) * 4
        data[idx] = r / count
        data[idx + 1] = g / count
        data[idx + 2] = b / count
      }
    }
  }

  // ============================================
  // Private - Canvas & Mask
  // ============================================

  private ensureCanvases(width: number, height: number): void {
    if (this.lastWidth === width && this.lastHeight === height) {
      return
    }

    if (!this.blurCanvas) {
      this.blurCanvas = document.createElement('canvas')
    }
    this.blurCanvas.width = width
    this.blurCanvas.height = height
    this.blurCtx = this.blurCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })

    if (!this.tempCanvas) {
      this.tempCanvas = document.createElement('canvas')
    }
    this.tempCanvas.width = width
    this.tempCanvas.height = height
    this.tempCtx = this.tempCanvas.getContext('2d', {
      alpha: false,
    })

    this.lastWidth = width
    this.lastHeight = height
  }

  private applyMaskHard(
      sourceData: Uint8ClampedArray,
      outputData: Uint8ClampedArray,
      mask: Uint8Array,
      width: number,
      height: number
  ): void {
    const length = width * height

    for (let i = 0; i < length; i++) {
      const pixelIndex = i * 4
      const isForeground = mask[i] === 0

      const shouldUseSharp = this.params.mode === BlurMode.BACKGROUND ? isForeground : !isForeground

      if (shouldUseSharp) {
        outputData[pixelIndex] = sourceData[pixelIndex]
        outputData[pixelIndex + 1] = sourceData[pixelIndex + 1]
        outputData[pixelIndex + 2] = sourceData[pixelIndex + 2]
        outputData[pixelIndex + 3] = 255
      }
    }
  }
}
