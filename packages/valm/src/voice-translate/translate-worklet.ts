// AudioWorklet перевода: один узел делает и захват, и воспроизведение.
//   вход  → ФНЧ + ресемплинг до inputRate (16 кГц) → чанки PCM16 по chunkMs → port ('chunk')
//   port ('play', PCM16 outputRate) → очередь → ресемплинг до частоты контекста → выход
// На выходе — тишина, пока очередь пуста, плюс оригинал × originalVolume (по умолчанию 0).
// passthrough = true (ошибка сессии при errorFallback 'original') — на выходе исходный голос, очередь сброшена.
// Модуль грузится из Blob URL: пакету не нужен отдельный файл в public/ приложения.
// Захват — общий с PcmCapture (ValmPcmCapture из pcm-capture/capture-source).

import { PCM_CAPTURE_SOURCE } from '../pcm-capture/capture-source'

export const TRANSLATE_PROCESSOR_NAME = 'valm-voice-translate-processor'

const WORKLET_SOURCE = `
${PCM_CAPTURE_SOURCE}

class VoiceTranslateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const o = options.processorOptions || {}
    this.outputRate = o.outputRate || 24000
    this.originalVolume = o.originalVolume || 0
    this.passthrough = false

    // захват
    this.capture = new ValmPcmCapture(o.inputRate || 16000, o.chunkMs || 100, (pcm, rms) => {
      this.port.postMessage({ type: 'chunk', pcm, rms }, [pcm])
    })

    // воспроизведение
    this.queue = []
    this.qOffset = 0
    this.outStep = this.outputRate / sampleRate
    this.outPos = 0
    this.isPlaying = false

    this.port.onmessage = (e) => {
      const m = e.data
      if (m.type === 'play') {
        const pcm = new Int16Array(m.pcm)
        const f = new Float32Array(pcm.length)
        for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768
        this.queue.push(f)
      } else if (m.type === 'clear') {
        this.queue = []
        this.qOffset = 0
        this.outPos = 0
      } else if (m.type === 'originalVolume') {
        this.originalVolume = m.value
      } else if (m.type === 'passthrough') {
        this.passthrough = m.value
        if (m.value) {
          this.queue = []
          this.qOffset = 0
          this.outPos = 0
        }
      }
    }
  }

  readQueued(index) {
    // сэмпл index от текущего начала очереди (с учётом qOffset)
    let i = index + this.qOffset
    for (let k = 0; k < this.queue.length; k++) {
      const buf = this.queue[k]
      if (i < buf.length) return buf[i]
      i -= buf.length
    }
    return null
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0]
    const output = outputs[0]
    const frames = output[0] ? output[0].length : 128

    // ── захват ──
    this.capture.process(input, frames)

    // ── воспроизведение ──
    const hadAudio = this.queue.length > 0
    for (let i = 0; i < frames; i++) {
      let s = 0
      const base = Math.floor(this.outPos)
      const a = this.readQueued(base)
      if (a !== null) {
        const b = this.readQueued(base + 1)
        const frac = this.outPos - base
        s = b === null ? a : a + (b - a) * frac
        this.outPos += this.outStep
      }
      const orig = input ? input[i] * (this.passthrough ? 1 : this.originalVolume) : 0
      for (let ch = 0; ch < output.length; ch++) output[ch][i] = s + orig
    }

    // выбросить доигранные буферы
    let consumed = Math.floor(this.outPos)
    this.outPos -= consumed
    consumed += this.qOffset
    while (this.queue.length && consumed >= this.queue[0].length) {
      consumed -= this.queue[0].length
      this.queue.shift()
    }
    this.qOffset = this.queue.length ? consumed : 0
    if (!this.queue.length) this.outPos = 0

    if (hadAudio && !this.isPlaying) {
      this.isPlaying = true
      this.port.postMessage({ type: 'playing' })
    } else if (!this.queue.length && this.isPlaying) {
      this.isPlaying = false
      this.port.postMessage({ type: 'drained' })
    }
    return true
  }
}

registerProcessor('${TRANSLATE_PROCESSOR_NAME}', VoiceTranslateProcessor)
`

const loadedContexts = new WeakSet<BaseAudioContext>()

export const loadTranslateWorklet = async (context: BaseAudioContext): Promise<void> => {
  if (loadedContexts.has(context)) return
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
  try {
    await context.audioWorklet.addModule(url)
    loadedContexts.add(context)
  } finally {
    URL.revokeObjectURL(url)
  }
}
