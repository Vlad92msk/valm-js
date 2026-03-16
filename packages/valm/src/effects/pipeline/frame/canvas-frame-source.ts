import { IFrameSource } from '../../types'

/**
 * CanvasFrameSource — захват кадров через video element + canvas
 *
 * Fallback реализация, работает во всех браузерах.
 * Использует скрытый video element для декодирования потока.
 */
export class CanvasFrameSource implements IFrameSource {
  private video: HTMLVideoElement | null = null
  private isInitialized = false

  // Отслеживание размеров
  private lastWidth = 0
  private lastHeight = 0
  private dimensionsCallbacks: Set<(dimensions: { width: number; height: number }) => void> = new Set()
  private resizeObserver: ResizeObserver | null = null

  async initialize(track: MediaStreamTrack): Promise<void> {
    if (this.isInitialized) {
      this.dispose()
    }

    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    this.video.autoplay = true
    this.video.srcObject = new MediaStream([track])

    await new Promise<void>((resolve, reject) => {
      const video = this.video!
      // eslint-disable-next-line prefer-const
      let timeoutId: ReturnType<typeof setTimeout>
      // eslint-disable-next-line prefer-const
      let cleanup: () => void

      const onLoaded = () => {
        cleanup()
        this.lastWidth = video.videoWidth
        this.lastHeight = video.videoHeight
        resolve()
      }

      const onError = () => {
        cleanup()
        reject(new Error('Video load error'))
      }

      // теперь можем присвоить
      cleanup = () => {
        clearTimeout(timeoutId)
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
      }

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Video load timeout'))
      }, 10_000)

      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
    })

    this.setupResizeObserver()

    try {
      await this.video.play()
    } catch {
      console.warn('Video play() was blocked by browser')
    }

    this.isInitialized = true
  }

  // Настройка отслеживания размеров
  private setupResizeObserver(): void {
    if (!this.video) return

    this.resizeObserver = new ResizeObserver(() => {
      this.checkDimensionsChanged()
    })

    this.resizeObserver.observe(this.video)

    // Также слушаем событие resize на video элементе (более надёжно для мобильных)
    this.video.addEventListener('resize', () => {
      this.checkDimensionsChanged()
    })
  }

  // Проверка изменения размеров
  private checkDimensionsChanged(): void {
    if (!this.video) return

    const currentWidth = this.video.videoWidth
    const currentHeight = this.video.videoHeight

    if (currentWidth !== this.lastWidth || currentHeight !== this.lastHeight) {
      this.lastWidth = currentWidth
      this.lastHeight = currentHeight

      // Уведомляем всех подписчиков
      const dimensions = { width: currentWidth, height: currentHeight }
      this.dimensionsCallbacks.forEach((callback) => callback(dimensions))
    }
  }

  // Подписка на события
  onDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void {
    this.dimensionsCallbacks.add(callback)
  }

  offDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void {
    this.dimensionsCallbacks.delete(callback)
  }

  capture(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    if (!this.video || !this.isInitialized) {
      return
    }
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height)
  }

  getVideoDimensions(): { width: number; height: number } {
    if (!this.video) {
      return { width: 640, height: 480 }
    }
    return {
      width: this.video.videoWidth || 640,
      height: this.video.videoHeight || 480,
    }
  }

  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
      this.video = null
    }

    this.dimensionsCallbacks.clear()
    this.isInitialized = false
  }
}
