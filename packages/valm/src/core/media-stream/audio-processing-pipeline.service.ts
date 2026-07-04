// Аудио-граф микрофона: source → gain → [ML worklet] → analyser → destination.
// gain и визуализация — в ядре; ML-шумоподавление вставляется плагином как provider.

export interface AudioVisualizationData {
  frequency: Uint8Array
  waveform: Uint8Array
}

export type AudioDataCallback = (data: AudioVisualizationData) => void

// Провайдер ML-обработки (реализуется в плагине valm-js/audio-effects)
export interface IAudioNoiseSuppressionProvider {
  createNode(context: AudioContext): Promise<AudioNode> | AudioNode
  destroy?(): void
}

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
}

export class AudioProcessingPipelineService implements IAudioProcessingPipeline {
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private mlNode: AudioNode | null = null

  private inputTrack: MediaStreamTrack | null = null
  private running = false

  private gainValue = 1
  private provider: IAudioNoiseSuppressionProvider | null = null

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

    if (this.provider) {
      this.mlNode = await this.createProviderNode(this.provider, this.context)
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
    this.mlNode = null

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
    this.provider?.destroy?.()
    this.provider = null
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

  async setNoiseSuppressionProvider(provider: IAudioNoiseSuppressionProvider | null): Promise<void> {
    if (this.provider === provider) return

    this.provider?.destroy?.()
    this.provider = provider

    if (this.running && this.context) {
      this.disconnectGraph()
      this.mlNode = provider ? await this.createProviderNode(provider, this.context) : null
      this.connectGraph()
    }
  }

  private async createProviderNode(provider: IAudioNoiseSuppressionProvider, context: AudioContext): Promise<AudioNode | null> {
    try {
      return await provider.createNode(context)
    } catch {
      // ML-провайдер не смог инициализироваться — граф работает без него
      return null
    }
  }

  private connectGraph(): void {
    if (!this.source || !this.gainNode || !this.analyser || !this.destination) return

    this.source.connect(this.gainNode)
    let tail: AudioNode = this.gainNode

    if (this.mlNode) {
      tail.connect(this.mlNode)
      tail = this.mlNode
    }

    tail.connect(this.analyser)
    this.analyser.connect(this.destination)
  }

  private disconnectGraph(): void {
    this.source?.disconnect()
    this.gainNode?.disconnect()
    this.mlNode?.disconnect()
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
