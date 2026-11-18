// AudioWorklet PcmCapture: только захват (без выхода, без воспроизведения).
// Узел без выходов — браузер обрабатывает его сам, подключать к destination не нужно.
// Модуль грузится из Blob URL: пакету не нужен отдельный файл в public/ приложения.

import { PCM_CAPTURE_SOURCE } from './capture-source'

export const PCM_CAPTURE_PROCESSOR_NAME = 'valm-pcm-capture-processor'

const WORKLET_SOURCE = `
${PCM_CAPTURE_SOURCE}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.paused = !!o.paused
    this.alive = true
    // поколение паузы: главный поток отбрасывает чанки, собранные до последнего setPaused
    this.gen = 0
    this.capture = new ValmPcmCapture(o.sampleRate || 16000, o.chunkMs || 100, (pcm, rms) => {
      this.port.postMessage({ type: 'chunk', pcm, rms, gen: this.gen }, [pcm])
    })
    this.port.onmessage = (e) => {
      const m = e.data
      if (m.type === 'paused') {
        this.paused = !!m.value
        this.gen = m.gen
        // на паузе ничего не копим: недособранный чанк выбрасываем, после паузы начинаем с чистого
        this.capture.reset()
      } else if (m.type === 'dispose') {
        this.alive = false
      }
    }
  }

  process(inputs) {
    if (!this.alive) return false
    if (!this.paused) this.capture.process(inputs[0] && inputs[0][0], 128)
    return true
  }
}

registerProcessor('${PCM_CAPTURE_PROCESSOR_NAME}', PcmCaptureProcessor)
`

// Один addModule на контекст, в том числе при параллельных create()
const loading = new WeakMap<BaseAudioContext, Promise<void>>()

export const loadPcmCaptureWorklet = (context: BaseAudioContext): Promise<void> => {
  let promise = loading.get(context)
  if (!promise) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
    promise = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    // неудачную загрузку не запоминаем — следующий create() попробует снова
    promise.catch(() => loading.delete(context))
    loading.set(context, promise)
  }
  return promise
}
