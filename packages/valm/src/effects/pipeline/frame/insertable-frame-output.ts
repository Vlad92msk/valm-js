import { IFrameOutput } from '../../types'

// Генерация трека через MediaStreamTrackGenerator (Chrome 94+, Edge 94+)
// Canvas используется для рисования эффектов, но выходной трек — через Insertable Streams
export class InsertableFrameOutput implements IFrameOutput {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private generator: MediaStreamTrackGenerator | null = null
  private writer: WritableStreamDefaultWriter<VideoFrame> | null = null

  initialize(width: number, height: number, fps: number): void {
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

  // Вызывается pipeline после отрисовки кадра на canvas —
  // создаём VideoFrame и отправляем в generator
  requestFrame(): void {
    if (!this.canvas || !this.writer) return

    try {
      const frame = new VideoFrame(this.canvas, {
        timestamp: performance.now() * 1000,
      })

      this.writer.write(frame).then(
        () => frame.close(),
        (error) => {
          frame.close()
          if ((error as Error).name !== 'InvalidStateError') {
            console.error('InsertableFrameOutput write error:', error)
          }
        },
      )
    } catch (error) {
      if ((error as Error).name !== 'InvalidStateError') {
        console.error('InsertableFrameOutput frame creation error:', error)
      }
    }
  }

  dispose(): void {
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
