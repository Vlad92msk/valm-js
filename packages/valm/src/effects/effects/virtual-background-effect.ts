import { EffectFeature, EffectType, FrameContext } from '../types'
import { BaseEffect } from './base-effect'

export enum BackgroundFitMode {
  STRETCH = 'stretch',
  COVER = 'cover',
  CONTAIN = 'contain',
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

  // Переиспользуемый ImageData для маски (R/G/B=255 один раз, alpha обновляется каждый кадр)
  private maskImageData: ImageData | null = null

  private lastWidth = 0
  private lastHeight = 0

  constructor(params: Partial<VirtualBackgroundParams> = {}) {
    super({ ...DEFAULT_PARAMS, ...params })
  }

  async initialize(): Promise<void> {
    if (this.params.imageUrl) {
      await this.loadBackgroundImage(this.params.imageUrl)
    }
  }

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

    // 3. Маска → tempCanvas (alpha = foreground region)
    this.drawMask(segmentationMask, width, height)

    // 4. Если нужно размытие краёв — blur прямо на tempCanvas (GPU-ускоренный)
    if (this.params.edgeBlur > 0) {
      this.tempCtx!.filter = `blur(${this.params.edgeBlur}px)`
      this.tempCtx!.drawImage(this.tempCanvas!, 0, 0)
      this.tempCtx!.filter = 'none'
    }

    // 5. Source × mask → tempCanvas (source-in оставляет только пиксели где alpha > 0)
    this.tempCtx!.globalCompositeOperation = 'source-in'
    this.tempCtx!.drawImage(sourceCanvas, 0, 0)
    this.tempCtx!.globalCompositeOperation = 'source-over'

    // 6. Sharp cutout → output (поверх фона)
    outputCtx.drawImage(this.tempCanvas!, 0, 0)
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
      alpha: false,
    })

    // Temp canvas (alpha: true — нужна прозрачность для compositing маски)
    if (!this.tempCanvas) {
      this.tempCanvas = document.createElement('canvas')
    }
    this.tempCanvas.width = width
    this.tempCanvas.height = height
    this.tempCtx = this.tempCanvas.getContext('2d')

    this.lastWidth = width
    this.lastHeight = height
    this.maskImageData = null
  }

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

  // Рисует маску сегментации на tempCanvas как alpha-канал.
  // Foreground → alpha=255, background → alpha=0.
  // Переиспользует ImageData: R/G/B=255 заполняются один раз, alpha обновляется каждый кадр.
  private drawMask(mask: Uint8Array, width: number, height: number): void {
    if (!this.tempCtx) return

    if (!this.maskImageData || this.maskImageData.width !== width || this.maskImageData.height !== height) {
      this.maskImageData = new ImageData(width, height)
      // R/G/B = 255 — заполняем один раз, дальше обновляем только alpha
      const data = this.maskImageData.data
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
      }
    }

    const data = this.maskImageData.data
    const length = width * height

    if (this.params.edgeSmoothing) {
      const threshold = this.params.smoothingThreshold
      for (let i = 0; i < length; i++) {
        const maskValue = mask[i] / 255
        // Foreground (человек) имеет низкое значение маски
        data[i * 4 + 3] = maskValue < threshold ? 255 : 0
      }
    } else {
      for (let i = 0; i < length; i++) {
        data[i * 4 + 3] = mask[i] === 0 ? 255 : 0
      }
    }

    this.tempCtx.putImageData(this.maskImageData, 0, 0)
  }
}
