import { TypedEventEmitter } from './typed-event-emitter'

export interface VoiceActivityConfig {
  /** Порог громкости для определения речи */
  volumeThreshold: number
  /** Через сколько мс тишины считаем что перестал говорить */
  silenceTimeout: number
  /** Размер FFT-блока (по умолчанию 256 или 512) */
  fftSize?: number
  /** Интервал обновления анализа, мс */
  updateInterval?: number
  /** 0–1, ближе к 1 — сильнее сглаживание */
  smoothingFactor?: number
}

export interface VoiceActivityState {
  volume: number
  isSpeaking: boolean
}

export type VoiceActivityCallback = (state: VoiceActivityState) => void

interface VADEventMap {
  stateChange: (state: VoiceActivityState) => void
}

export class VoiceActivityDetector extends TypedEventEmitter<VADEventMap> {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastSpeaking = false
  private lastVolume = 0
  private silenceStart = 0
  private config: VoiceActivityConfig

  constructor(config?: VoiceActivityConfig) {
    super()
    this.config = {
      fftSize: 256,
      updateInterval: 100,
      smoothingFactor: 0.2,
      ...config,
    }
  }

  start(track: MediaStreamTrack): void {
    this.stop()

    if (!track.enabled) {
      return
    }

    try {
      this.audioContext = new AudioContext()

      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.config.fftSize!

      const stream = new MediaStream([track])
      this.source = this.audioContext.createMediaStreamSource(stream)
      this.source.connect(this.analyser)

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      const interval = this.config.updateInterval ?? 100

      const analyze = () => {
        if (!this.analyser || !track.enabled) {
          this.stop()
          return
        }

        this.analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const volume = this.smoothVolume(Math.round(avg))

        let isSpeaking = this.lastSpeaking
        const now = Date.now()

        if (volume > this.config.volumeThreshold) {
          isSpeaking = true
          this.silenceStart = now
        } else if (isSpeaking && now - this.silenceStart > this.config.silenceTimeout) {
          isSpeaking = false
        }

        if (isSpeaking !== this.lastSpeaking || Math.abs(volume - this.lastVolume) > 1) {
          this.lastSpeaking = isSpeaking
          this.lastVolume = volume
          this.emit('stateChange', { isSpeaking, volume } as VoiceActivityState)
        }
      }

      const startInterval = () => {
        this.intervalId = setInterval(analyze, interval)
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(startInterval)
      } else {
        startInterval()
      }
    } catch (error) {
      console.error('Error starting VAD:', error)
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.analyser = null
    this.lastSpeaking = false
    this.lastVolume = 0
  }

  updateConfig(newConfig: Partial<VoiceActivityConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  onStateChange(callback: VoiceActivityCallback): VoidFunction {
    return this.on('stateChange', callback)
  }

  private smoothVolume(current: number): number {
    return this.lastVolume * (this.config.smoothingFactor ?? 0.2) + current * (1 - (this.config.smoothingFactor ?? 0.2))
  }
}

export type VoiceActivityDetectorFactory = (options: { volumeThreshold: number; silenceTimeout: number }) => VoiceActivityDetector
