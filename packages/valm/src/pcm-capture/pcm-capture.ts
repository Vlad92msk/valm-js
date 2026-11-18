import { loadPcmCaptureWorklet, PCM_CAPTURE_PROCESSOR_NAME } from './pcm-capture-worklet'

// Узел захвата: любой аудио-вход → PCM16 моно нужной частоты чанками фиксированной длины + RMS.
// Ничего не воспроизводит и никуда не отправляет — чанки получает приложение (onChunk).

export interface PcmCaptureOptions {
  // Частота выхода, Гц. По умолчанию 16000
  sampleRate?: number
  // Длина чанка, мс. По умолчанию 100
  chunkMs?: number
  // Создать на паузе. По умолчанию false
  paused?: boolean
}

export interface PcmCaptureChunk {
  // PCM16 моно, little-endian (как в памяти), sampleRate × chunkMs / 1000 сэмплов
  pcm: Int16Array
  // Средняя громкость чанка, 0..1
  rms: number
}

interface CaptureMessage {
  type: 'chunk'
  pcm: ArrayBuffer
  rms: number
  gen: number
}

export class PcmCapture {
  // Вход: source.connect(capture.node). Выходов нет — подключать дальше не нужно.
  readonly node: AudioWorkletNode
  readonly sampleRate: number
  readonly chunkMs: number

  private readonly listeners = new Set<(chunk: PcmCaptureChunk) => void>()
  private paused: boolean
  private disposed = false
  private gen = 0

  private constructor(node: AudioWorkletNode, sampleRate: number, chunkMs: number, paused: boolean) {
    this.node = node
    this.sampleRate = sampleRate
    this.chunkMs = chunkMs
    this.paused = paused
    node.port.onmessage = (e: MessageEvent<CaptureMessage>) => {
      if (this.disposed || this.paused || e.data.type !== 'chunk' || e.data.gen !== this.gen) return
      const chunk: PcmCaptureChunk = { pcm: new Int16Array(e.data.pcm), rms: e.data.rms }
      this.listeners.forEach((cb) => cb(chunk))
    }
  }

  // Грузит ворклет (Blob URL) один раз на контекст. Бросает, если AudioWorklet недоступен или параметры неверны.
  static async create(context: BaseAudioContext, options: PcmCaptureOptions = {}): Promise<PcmCapture> {
    const sampleRate = options.sampleRate ?? 16000
    const chunkMs = options.chunkMs ?? 100
    if (!(sampleRate > 0) || !(chunkMs > 0)) {
      throw new RangeError(`PcmCapture: sampleRate and chunkMs must be positive (got ${sampleRate}, ${chunkMs})`)
    }
    if (typeof context.audioWorklet === 'undefined') {
      throw new Error('PcmCapture: AudioWorklet is not available in this browser')
    }
    await loadPcmCaptureWorklet(context)
    const paused = options.paused ?? false
    const node = new AudioWorkletNode(context, PCM_CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions: { sampleRate, chunkMs, paused },
    })
    return new PcmCapture(node, sampleRate, chunkMs, paused)
  }

  get isPaused(): boolean {
    return this.paused
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  // Подписка на чанки. Возвращает отписку.
  onChunk(cb: (chunk: PcmCaptureChunk) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  // На паузе чанки не идут и ворклет ничего не копит; после паузы первый чанк — полный, со звуком после снятия паузы.
  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return
    this.paused = paused
    this.gen++
    this.node.port.postMessage({ type: 'paused', value: paused, gen: this.gen })
  }

  // Отключает узел от входов и останавливает ворклет. Повторный вызов ничего не делает.
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.node.port.postMessage({ type: 'dispose' })
    this.node.port.onmessage = null
    this.node.disconnect()
  }
}
