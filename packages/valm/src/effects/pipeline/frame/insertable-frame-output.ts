import { IFrameOutput } from '../../types'

// Генерация трека через MediaStreamTrackGenerator (Chrome 94+, Edge 94+)
// Canvas используется для рисования эффектов, но выходной трек — через Insertable Streams
export class InsertableFrameOutput implements IFrameOutput {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private generator: MediaStreamTrackGenerator | null = null
  private writer: WritableStreamDefaultWriter<VideoFrame> | null = null
  private fps: number = 30
  private frameInterval: number = 0
  private lastFrameTime: number = 0
  private isRunning = false
  private animationFrameId: number | null = null

  initialize(width: number, height: number, fps: number): void {
    this.fps = fps
    this.frameInterval = 1000 / fps

    // Canvas для рисования
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height

    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    })

    if (!this.ctx) {
      throw new Error('Failed to get canvas context')
    }

    // Создаём generator
    this.generator = new MediaStreamTrackGenerator({ kind: 'video' })
    this.writer = this.generator.writable.getWriter()

    // Запускаем отправку кадров
    this.isRunning = true
    this.startFrameLoop()
  }

  private startFrameLoop(): void {
    const sendFrame = async () => {
      if (!this.isRunning || !this.canvas || !this.writer) return

      const now = performance.now()

      // Throttle по FPS
      if (now - this.lastFrameTime >= this.frameInterval) {
        this.lastFrameTime = now

        try {
          // Создаём VideoFrame из canvas
          const frame = new VideoFrame(this.canvas, {
            timestamp: now * 1000, // микросекунды
          })

          await this.writer.write(frame)
          frame.close()
        } catch (error) {
          // Игнорируем ошибки при закрытии
          if ((error as Error).name !== 'InvalidStateError') {
            console.error('InsertableFrameOutput write error:', error)
          }
        }
      }

      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(sendFrame)
      }
    }

    sendFrame()
  }

  getTrack(): MediaStreamTrack | null {
    return this.generator
  }

  getCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      throw new Error('InsertableFrameOutput not initialized')
    }
    return this.canvas
  }

  getContext(): CanvasRenderingContext2D {
    if (!this.ctx) {
      throw new Error('InsertableFrameOutput not initialized')
    }
    return this.ctx
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return

    this.canvas.width = width
    this.canvas.height = height
  }

  requestFrame(): void {}

  dispose(): void {
    this.isRunning = false

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.writer) {
      this.writer.close().catch(() => {})
      this.writer = null
    }

    if (this.generator) {
      this.generator.stop()
      this.generator = null
    }

    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
      this.canvas = null
    }

    this.ctx = null
  }
}
