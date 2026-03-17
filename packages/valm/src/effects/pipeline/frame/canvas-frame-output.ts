import { IFrameOutput } from '../../types'

// Safari: captureStream(0) + явный track.requestFrame() для генерации кадров
export class CanvasFrameOutput implements IFrameOutput {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private stream: MediaStream | null = null
  private track: MediaStreamTrack | null = null
  private fps: number = 30
  private isSafari: boolean = false
  private lastDirtyPixel: number = 0

  initialize(width: number, height: number, fps: number): void {
    this.fps = fps
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

    this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

    // Safari fix: рисуем первый кадр перед captureStream
    this.ctx.fillStyle = '#000000'
    this.ctx.fillRect(0, 0, width, height)

    if (this.isSafari) {
      this.stream = this.canvas.captureStream(0)
    } else {
      this.stream = this.canvas.captureStream(fps)
    }

    this.track = this.stream.getVideoTracks()[0] || null

    if (this.track) {
      this.track.enabled = true

      // ВАЖНО для Safari: генерируем первый кадр сразу!
      if (this.isSafari) {
        this.requestFrame()
      }
    }
  }

  getTrack(): MediaStreamTrack | null {
    return this.track
  }

  getCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      throw new Error('CanvasFrameOutput not initialized')
    }
    return this.canvas
  }

  getContext(): CanvasRenderingContext2D {
    if (!this.ctx) {
      throw new Error('CanvasFrameOutput not initialized')
    }
    return this.ctx
  }

  requestFrame(): void {
    if (!this.track) return

    if (this.isSafari) {
      this.addDirtyPixel()

      // @ts-ignore
      if (typeof this.track?.requestFrame === 'function') {
        // @ts-ignore
        this.track?.requestFrame()
      } else {
        console.error('track.requestFrame is not a function!')
      }
    }
  }

  // Safari workaround: без меняющегося пикселя Safari может не генерировать новые кадры
  private addDirtyPixel(): void {
    if (!this.ctx || !this.canvas) return

    // Меняем значение каждый кадр (0 или 1)
    this.lastDirtyPixel = 1 - this.lastDirtyPixel

    // Рисуем практически невидимый пиксель в углу
    const alpha = 0.001 + this.lastDirtyPixel * 0.001
    this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    this.ctx.fillRect(this.canvas.width - 1, this.canvas.height - 1, 1, 1)
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.ctx) return

    this.canvas.width = width
    this.canvas.height = height
  }

  dispose(): void {
    if (this.track) {
      this.track.stop()
      this.track = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }

    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
      this.canvas = null
    }

    this.ctx = null
  }
}
