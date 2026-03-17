import { IFrameSource } from '../../types'

// Захват кадров через Insertable Streams API (Chrome 94+, Edge 94+)
export class InsertableFrameSource implements IFrameSource {
  private processor: MediaStreamTrackProcessor | null = null
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null
  private currentFrame: VideoFrame | null = null
  private width = 640
  private height = 480
  private isInitialized = false

  // Отслеживание размеров
  private dimensionsCallbacks: Set<(dimensions: { width: number; height: number }) => void> = new Set()

  async initialize(track: MediaStreamTrack): Promise<void> {
    if (this.isInitialized) {
      this.dispose()
    }

    const settings = track.getSettings()
    this.width = settings.width || 640
    this.height = settings.height || 480

    this.processor = new MediaStreamTrackProcessor({ track })
    this.reader = this.processor.readable.getReader()

    this.startReading()
    this.isInitialized = true
  }

  private async startReading(): Promise<void> {
    if (!this.reader) return

    try {
      while (true) {
        const { value: frame, done } = await this.reader.read()

        if (done) break

        if (this.currentFrame) {
          this.currentFrame.close()
        }

        this.currentFrame = frame

        // Обновляем размеры и проверяем изменения
        if (frame) {
          const newWidth = frame.displayWidth
          const newHeight = frame.displayHeight

          if (newWidth !== this.width || newHeight !== this.height) {
            this.width = newWidth
            this.height = newHeight

            // Уведомляем подписчиков
            const dimensions = { width: newWidth, height: newHeight }
            this.dimensionsCallbacks.forEach((callback) => callback(dimensions))
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('InsertableFrameSource read error:', error)
      }
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
    if (!this.currentFrame || !this.isInitialized) {
      return
    }
    ctx.drawImage(this.currentFrame as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  }

  getVideoDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  dispose(): void {
    if (this.currentFrame) {
      this.currentFrame.close()
      this.currentFrame = null
    }

    if (this.reader) {
      this.reader.cancel().catch(() => {})
      this.reader = null
    }

    this.dimensionsCallbacks.clear()
    this.processor = null
    this.isInitialized = false
  }
}
