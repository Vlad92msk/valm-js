import { EffectFeature, EffectType, FrameContext } from '../types'
import { BaseEffect } from './base-effect'

/**
 * Режим масштабирования фона
 */
export enum BackgroundFitMode {
  /** Растянуть фон на всю область */
  STRETCH = 'stretch',
  /** Покрыть всю область с сохранением пропорций (может обрезаться) */
  COVER = 'cover',
  /** Вместить весь фон (могут быть поля) */
  CONTAIN = 'contain',
  /** Замостить фон */
  TILE = 'tile',
}

/**
 * Параметры виртуального фона
 */
export interface VirtualBackgroundParams {
  /** URL изображения фона */
  imageUrl: string | null
  /** Цвет фона (используется если imageUrl === null или как fallback) */
  backgroundColor: string
  /** Режим масштабирования */
  fitMode: BackgroundFitMode
  /** Сглаживание краёв */
  edgeSmoothing: boolean
  /** Порог для сглаживания (0-1) */
  smoothingThreshold: number
  /** Размытие краёв маски для более плавного перехода */
  edgeBlur: number
}

/**
 * Пресеты качества
 */
export const VIRTUAL_BG_PRESETS = {
  HIGH_QUALITY: {
    edgeSmoothing: true,
    smoothingThreshold: 0.4,
    edgeBlur: 3,
  },
  BALANCED: {
    edgeSmoothing: true,
    smoothingThreshold: 0.5,
    edgeBlur: 2,
  },
  PERFORMANCE: {
    edgeSmoothing: false,
    smoothingThreshold: 0.6,
    edgeBlur: 0,
  },
} as const

const DEFAULT_PARAMS: VirtualBackgroundParams = {
  imageUrl: null,
  backgroundColor: '#00AA00', // green screen style
  fitMode: BackgroundFitMode.COVER,
  ...VIRTUAL_BG_PRESETS.BALANCED,
}

/**
 * VirtualBackgroundEffect — эффект замены фона
 *
 * Использует сегментацию для разделения человека и фона,
 * затем заменяет фон на пользовательское изображение или цвет.
 */
export class VirtualBackgroundEffect extends BaseEffect<VirtualBackgroundParams> {
  readonly name = 'virtual_background'
  readonly type = EffectType.VIRTUAL_BACKGROUND
  readonly requiredFeatures: EffectFeature[] = [EffectFeature.SEGMENTATION]

  // Изображение фона
  private backgroundImage: HTMLImageElement | null = null
  private imageLoading = false
  private imageLoadError = false
  private pendingImageUrl: string | null = null

  // Рабочие canvas
  private backgroundCanvas: HTMLCanvasElement | null = null
  private backgroundCtx: CanvasRenderingContext2D | null = null
  private tempCanvas: HTMLCanvasElement | null = null
  private tempCtx: CanvasRenderingContext2D | null = null

  private lastWidth = 0
  private lastHeight = 0

  constructor(params: Partial<VirtualBackgroundParams> = {}) {
    super({ ...DEFAULT_PARAMS, ...params })
  }

  /**
   * Инициализация — загрузка изображения фона
   */
  async initialize(): Promise<void> {
    if (this.params.imageUrl) {
      await this.loadBackgroundImage(this.params.imageUrl)
    }
  }

  /**
   * Установить новое изображение фона
   */
  async setBackgroundImage(url: string): Promise<void> {
    await this.loadBackgroundImage(url)
    this.params.imageUrl = url
  }

  apply(ctx: FrameContext): void {
    if (!this.enabled) return

    const { sourceCanvas, outputCtx, width, height, segmentationMask } = ctx

    // Если нет маски — просто копируем
    if (!segmentationMask) {
      outputCtx.drawImage(sourceCanvas, 0, 0)
      return
    }

    // Инициализируем canvas если нужно
    this.ensureCanvases(width, height)
    if (!this.backgroundCtx || !this.tempCtx || !this.backgroundCanvas || !this.tempCanvas) return

    // 1. Рисуем фон (изображение или цвет)
    this.drawBackground(width, height)

    // 2. Копируем фон на output
    outputCtx.drawImage(this.backgroundCanvas, 0, 0, width, height)

    // 3. Применяем размытие краёв маски если нужно
    const processedMask = this.params.edgeBlur > 0 ? this.blurMask(segmentationMask, width, height, this.params.edgeBlur) : segmentationMask

    // 4. Накладываем человека по маске
    const sourceImageData = ctx.sourceCtx.getImageData(0, 0, width, height)
    const outputImageData = outputCtx.getImageData(0, 0, width, height)

    if (this.params.edgeSmoothing) {
      this.applyMaskWithSmoothing(sourceImageData.data, outputImageData.data, processedMask, width, height)
    } else {
      this.applyMaskHard(sourceImageData.data, outputImageData.data, processedMask, width, height)
    }

    outputCtx.putImageData(outputImageData, 0, 0)
  }

  dispose(): void {
    if (this.backgroundCanvas) {
      this.backgroundCanvas.width = 0
      this.backgroundCanvas.height = 0
      this.backgroundCanvas = null
    }

    if (this.tempCanvas) {
      this.tempCanvas.width = 0
      this.tempCanvas.height = 0
      this.tempCanvas = null
    }

    this.backgroundCtx = null
    this.tempCtx = null
    this.backgroundImage = null
    this.pendingImageUrl = null
  }

  protected onParamsUpdated(): void {
    // Если изменился URL изображения, загружаем новое
    if (this.params.imageUrl && this.params.imageUrl !== this.backgroundImage?.src) {
      this.loadBackgroundImage(this.params.imageUrl).catch(console.error)
    }
  }

  // ============================================
  // Private
  // ============================================

  private ensureCanvases(width: number, height: number): void {
    if (this.lastWidth === width && this.lastHeight === height) {
      return
    }

    // Background canvas
    if (!this.backgroundCanvas) {
      this.backgroundCanvas = document.createElement('canvas')
    }
    this.backgroundCanvas.width = width
    this.backgroundCanvas.height = height
    this.backgroundCtx = this.backgroundCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })

    // Temp canvas
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

  /**
   * Загрузить изображение фона
   */
  private async loadBackgroundImage(url: string): Promise<void> {
    // Если уже загружаем — запоминаем URL для загрузки после завершения текущей
    if (this.imageLoading) {
      this.pendingImageUrl = url
      return
    }

    this.imageLoading = true
    this.imageLoadError = false

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        this.backgroundImage = img
        this.imageLoading = false
        this.imageLoadError = false

        // Если пока загружали, пришёл новый URL — загружаем его
        const pending = this.pendingImageUrl
        if (pending) {
          this.pendingImageUrl = null
          this.loadBackgroundImage(pending).catch(console.error)
        }

        resolve()
      }

      img.onerror = () => {
        this.imageLoading = false
        this.imageLoadError = true
        this.backgroundImage = null

        // При ошибке тоже проверяем pending
        const pending = this.pendingImageUrl
        if (pending) {
          this.pendingImageUrl = null
          this.loadBackgroundImage(pending).catch(console.error)
        }

        reject(new Error(`Failed to load background image: ${url}`))
      }

      img.src = url
    })
  }

  /**
   * Нарисовать фон (изображение или цвет)
   */
  private drawBackground(width: number, height: number): void {
    if (!this.backgroundCtx || !this.backgroundCanvas) return

    // Если есть изображение и оно загружено
    if (this.backgroundImage && !this.imageLoadError) {
      this.drawBackgroundImage(width, height)
    } else {
      // Используем цвет
      this.backgroundCtx.fillStyle = this.params.backgroundColor
      this.backgroundCtx.fillRect(0, 0, width, height)
    }
  }

  /**
   * Нарисовать изображение в зависимости от fitMode
   */
  private drawBackgroundImage(width: number, height: number): void {
    if (!this.backgroundCtx || !this.backgroundImage) return

    const img = this.backgroundImage
    const canvasRatio = width / height
    const imageRatio = img.width / img.height

    switch (this.params.fitMode) {
      case BackgroundFitMode.STRETCH:
        this.backgroundCtx.drawImage(img, 0, 0, width, height)
        break

      case BackgroundFitMode.COVER: {
        let drawWidth, drawHeight, offsetX, offsetY

        if (canvasRatio > imageRatio) {
          drawWidth = width
          drawHeight = width / imageRatio
          offsetX = 0
          offsetY = (height - drawHeight) / 2
        } else {
          drawWidth = height * imageRatio
          drawHeight = height
          offsetX = (width - drawWidth) / 2
          offsetY = 0
        }

        this.backgroundCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
        break
      }

      case BackgroundFitMode.CONTAIN: {
        // Сначала заливаем цветом
        this.backgroundCtx.fillStyle = this.params.backgroundColor
        this.backgroundCtx.fillRect(0, 0, width, height)

        let drawWidth, drawHeight, offsetX, offsetY

        if (canvasRatio > imageRatio) {
          drawHeight = height
          drawWidth = height * imageRatio
          offsetX = (width - drawWidth) / 2
          offsetY = 0
        } else {
          drawWidth = width
          drawHeight = width / imageRatio
          offsetX = 0
          offsetY = (height - drawHeight) / 2
        }

        this.backgroundCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
        break
      }

      case BackgroundFitMode.TILE: {
        const pattern = this.backgroundCtx.createPattern(img, 'repeat')
        if (pattern) {
          this.backgroundCtx.fillStyle = pattern
          this.backgroundCtx.fillRect(0, 0, width, height)
        }
        break
      }
    }
  }

  /**
   * Размыть маску для более плавных краёв
   */
  private blurMask(mask: Uint8Array, width: number, height: number, blurRadius: number): Uint8Array {
    if (!this.tempCanvas || !this.tempCtx) return mask

    // Создаём imageData из маски
    const imageData = this.tempCtx.createImageData(width, height)
    for (let i = 0; i < mask.length; i++) {
      const val = mask[i]
      imageData.data[i * 4] = val
      imageData.data[i * 4 + 1] = val
      imageData.data[i * 4 + 2] = val
      imageData.data[i * 4 + 3] = 255
    }

    this.tempCtx.putImageData(imageData, 0, 0)

    // Применяем blur через filter
    this.tempCtx.filter = `blur(${blurRadius}px)`
    this.tempCtx.drawImage(this.tempCanvas, 0, 0)
    this.tempCtx.filter = 'none'

    // Читаем обратно
    const blurred = this.tempCtx.getImageData(0, 0, width, height)
    const result = new Uint8Array(mask.length)
    for (let i = 0; i < mask.length; i++) {
      result[i] = blurred.data[i * 4]
    }

    return result
  }

  /**
   * Применить маску без сглаживания (быстрее)
   */
  private applyMaskHard(sourceData: Uint8ClampedArray, outputData: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): void {
    const length = width * height

    for (let i = 0; i < length; i++) {
      const pixelIndex = i * 4
      const isForeground = mask[i] === 0

      if (isForeground) {
        outputData[pixelIndex] = sourceData[pixelIndex]
        outputData[pixelIndex + 1] = sourceData[pixelIndex + 1]
        outputData[pixelIndex + 2] = sourceData[pixelIndex + 2]
        outputData[pixelIndex + 3] = 255
      }
    }
  }

  /**
   * Применить маску со сглаживанием краёв (качественнее)
   */
  private applyMaskWithSmoothing(sourceData: Uint8ClampedArray, outputData: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): void {
    const length = width * height
    const threshold = this.params.smoothingThreshold

    for (let i = 0; i < length; i++) {
      const pixelIndex = i * 4
      const maskValue = mask[i] / 255

      // Foreground (человек) имеет низкое значение маски
      const alpha = maskValue < threshold ? 1 : Math.max(0, (threshold - maskValue) / threshold)

      if (alpha > 0) {
        outputData[pixelIndex] = sourceData[pixelIndex] * alpha + outputData[pixelIndex] * (1 - alpha)
        outputData[pixelIndex + 1] = sourceData[pixelIndex + 1] * alpha + outputData[pixelIndex + 1] * (1 - alpha)
        outputData[pixelIndex + 2] = sourceData[pixelIndex + 2] * alpha + outputData[pixelIndex + 2] * (1 - alpha)
        outputData[pixelIndex + 3] = 255
      }
    }
  }
}
