// Аудио-граф микрофона: source → gain → [шумоподавление] → [перевод голоса] → analyser → destination.
// gain и визуализация — в ядре; обработчики (слоты) вставляются плагинами как provider.

export interface AudioVisualizationData {
  frequency: Uint8Array
  waveform: Uint8Array
}

export type AudioDataCallback = (data: AudioVisualizationData) => void

// Обработчик в аудио-графе микрофона (шумоподавление — valm-js/audio-effects, перевод — valm-js/voice-translate)
export interface IAudioProcessorProvider {
  // Создать узел в AudioContext графа. Вызывается при каждом запуске графа (новый трек → новый контекст)
  createNode(context: AudioContext): Promise<AudioNode> | AudioNode
  // Граф остановлен (микрофон выключен, смена трека): узел больше не используется, провайдер остаётся
  releaseNode?(): void
  // Провайдер снят со слота или граф уничтожен
  destroy?(): void
}

// Провайдер ML-шумоподавления (реализуется в плагине valm-js/audio-effects)
export type IAudioNoiseSuppressionProvider = IAudioProcessorProvider

// Слоты обработчиков; порядок в графе — как в AUDIO_PROCESSOR_SLOTS
export type AudioProcessorSlot = 'noise-suppression' | 'voice-translation'

export const AUDIO_PROCESSOR_SLOTS: readonly AudioProcessorSlot[] = ['noise-suppression', 'voice-translation']

export interface IAudioProcessingPipeline {
  isRunning(): boolean
  start(track: MediaStreamTrack): Promise<void>
  stop(): void
  getOutputTrack(): MediaStreamTrack | null
  setGain(value: number): void
  getGain(): number
  getFrequencyData(): Uint8Array
  getWaveformData(): Uint8Array
  onAudioData(cb: AudioDataCallback): VoidFunction
  setNoiseSuppressionProvider(provider: IAudioNoiseSuppressionProvider | null): Promise<void>
  setProcessor(slot: AudioProcessorSlot, provider: IAudioProcessorProvider | null): Promise<void>
  getProcessor(slot: AudioProcessorSlot): IAudioProcessorProvider | null
}

export class AudioProcessingPipelineService implements IAudioProcessingPipeline {
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private processorNodes = new Map<AudioProcessorSlot, AudioNode>()

  private inputTrack: MediaStreamTrack | null = null
  private running = false

  private gainValue = 1
  private providers = new Map<AudioProcessorSlot, IAudioProcessorProvider>()

  private frequencyData = new Uint8Array(0)
  private waveformData = new Uint8Array(0)
  private audioDataCallbacks = new Set<AudioDataCallback>()
  private rafId: number | null = null

  isRunning(): boolean {
    return this.running
  }

  async start(track: MediaStreamTrack): Promise<void> {
    if (this.running && this.inputTrack === track) return
    this.stop()

    this.inputTrack = track
    this.context = new AudioContext()
    this.source = this.context.createMediaStreamSource(new MediaStream([track]))
    this.gainNode = this.context.createGain()
    this.gainNode.gain.value = this.gainValue
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.destination = this.context.createMediaStreamDestination()

    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
    this.waveformData = new Uint8Array(this.analyser.fftSize)

    for (const [slot, provider] of this.providers) {
      const node = await this.createProviderNode(provider, this.context)
      if (node) this.processorNodes.set(slot, node)
    }

    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => {})
    }

    this.connectGraph()
    this.running = true

    if (this.audioDataCallbacks.size > 0) {
      this.startAnalysisLoop()
    }
  }

  stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    this.disconnectGraph()
    if (this.processorNodes.size > 0) {
      this.processorNodes.clear()
      this.providers.forEach((provider) => provider.releaseNode?.())
    }

    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {})
    }

    this.context = null
    this.source = null
    this.gainNode = null
    this.analyser = null
    this.destination = null
    this.inputTrack = null
    this.running = false
  }

  // Полная очистка, включая провайдера
  destroy(): void {
    this.stop()
    this.providers.forEach((provider) => provider.destroy?.())
    this.providers.clear()
    this.audioDataCallbacks.clear()
  }

  getOutputTrack(): MediaStreamTrack | null {
    return this.destination?.stream.getAudioTracks()[0] ?? null
  }

  setGain(value: number): void {
    this.gainValue = Math.max(0, value)
    if (this.gainNode && this.context) {
      // Плавно, чтобы не было щелчков
      this.gainNode.gain.setTargetAtTime(this.gainValue, this.context.currentTime, 0.01)
    }
  }

  getGain(): number {
    return this.gainValue
  }

  getFrequencyData(): Uint8Array {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData)
    }
    return this.frequencyData
  }

  getWaveformData(): Uint8Array {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.waveformData)
    }
    return this.waveformData
  }

  onAudioData(cb: AudioDataCallback): VoidFunction {
    this.audioDataCallbacks.add(cb)
    if (this.running && this.rafId == null) {
      this.startAnalysisLoop()
    }
    return () => {
      this.audioDataCallbacks.delete(cb)
      if (this.audioDataCallbacks.size === 0 && this.rafId != null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
    }
  }

  setNoiseSuppressionProvider(provider: IAudioNoiseSuppressionProvider | null): Promise<void> {
    return this.setProcessor('noise-suppression', provider)
  }

  getProcessor(slot: AudioProcessorSlot): IAudioProcessorProvider | null {
    return this.providers.get(slot) ?? null
  }

  // Поставить / снять обработчик слота. На работающем графе узлы переподключаются без смены выходного трека
  async setProcessor(slot: AudioProcessorSlot, provider: IAudioProcessorProvider | null): Promise<void> {
    const previous = this.providers.get(slot) ?? null
    if (previous === provider) return

    previous?.destroy?.()
    if (provider) this.providers.set(slot, provider)
    else this.providers.delete(slot)

    if (this.running && this.context) {
      const context = this.context
      const node = provider ? await this.createProviderNode(provider, context) : null
      // Пока создавался узел, граф могли остановить или провайдера сменить
      if (this.context !== context || (this.providers.get(slot) ?? null) !== provider) return
      this.disconnectGraph()
      if (node) this.processorNodes.set(slot, node)
      else this.processorNodes.delete(slot)
      this.connectGraph()
    }
  }

  private async createProviderNode(provider: IAudioProcessorProvider, context: AudioContext): Promise<AudioNode | null> {
    try {
      return await provider.createNode(context)
    } catch {
      // Провайдер не смог инициализироваться — граф работает без него (о причине сообщает сам провайдер)
      return null
    }
  }

  private connectGraph(): void {
    if (!this.source || !this.gainNode || !this.analyser || !this.destination) return

    this.source.connect(this.gainNode)
    let tail: AudioNode = this.gainNode

    for (const slot of AUDIO_PROCESSOR_SLOTS) {
      const node = this.processorNodes.get(slot)
      if (!node) continue
      tail.connect(node)
      tail = node
    }

    tail.connect(this.analyser)
    this.analyser.connect(this.destination)
  }

  private disconnectGraph(): void {
    this.source?.disconnect()
    this.gainNode?.disconnect()
    this.processorNodes.forEach((node) => node.disconnect())
    this.analyser?.disconnect()
  }

  private startAnalysisLoop(): void {
    const loop = () => {
      if (!this.analyser) {
        this.rafId = null
        return
      }
      this.analyser.getByteFrequencyData(this.frequencyData)
      this.analyser.getByteTimeDomainData(this.waveformData)
      this.audioDataCallbacks.forEach((cb) => cb({ frequency: this.frequencyData, waveform: this.waveformData }))
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }
}
