// Захват в AudioWorklet — общий исходник для всех ворклетов пакета (перевод голоса, PcmCapture).
// Вход (частота контекста) → ФНЧ → линейный ресемплинг до outRate → чанки PCM16 по chunkMs + RMS чанка.
// Это строка JS: ворклеты грузятся из Blob URL и не могут импортировать модули пакета.
// Класс встраивается в исходник ворклета перед его процессором; `sampleRate` — глобал AudioWorkletGlobalScope.

export const PCM_CAPTURE_SOURCE = `
class ValmPcmCapture {
  // emit(pcm: ArrayBuffer, rms: number) — буфер отдаётся во владение (можно передать через postMessage)
  constructor(outRate, chunkMs, emit) {
    this.outRate = outRate
    this.chunkSize = Math.max(1, Math.round(outRate * chunkMs / 1000))
    this.emit = emit
    this.step = sampleRate / outRate
    this.lpAlpha = Math.min(1, (2 * Math.PI * (outRate * 0.45)) / sampleRate)
    this.reset()
  }

  // Сбросить недособранный чанк и состояние фильтра
  reset() {
    this.pos = 0
    this.prev = 0
    this.lp = 0
    this.chunk = new Int16Array(this.chunkSize)
    this.fill = 0
    this.sumSq = 0
  }

  push(x) {
    this.chunk[this.fill++] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
    this.sumSq += x * x
    if (this.fill === this.chunkSize) {
      const rms = Math.sqrt(this.sumSq / this.chunkSize)
      const out = this.chunk
      this.chunk = new Int16Array(this.chunkSize)
      this.fill = 0
      this.sumSq = 0
      this.emit(out.buffer, rms)
    }
  }

  // input — канал 0 входа или undefined (Firefox отдаёт 0 каналов на «тихий» вход): тогда пишем тишину,
  // чтобы поток шёл непрерывно — по паузе сервис распознаёт конец фразы.
  process(input, frames) {
    const n = input ? input.length : frames
    for (let i = 0; i < n; i++) {
      this.lp += this.lpAlpha * ((input ? input[i] : 0) - this.lp)
      const cur = this.lp
      // выдаём сэмплы на позициях pos в интервале [i-1, i]
      while (this.pos <= 1) {
        this.push(this.prev + (cur - this.prev) * this.pos)
        this.pos += this.step
      }
      this.pos -= 1
      this.prev = cur
    }
  }
}
`
