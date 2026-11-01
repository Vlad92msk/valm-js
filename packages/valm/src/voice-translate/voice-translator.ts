import { TypedEventEmitter } from '../core/utils/typed-event-emitter'
import type { IAudioProcessorProvider } from '../core/media-stream/audio-processing-pipeline.service'
import { loadTranslateWorklet, TRANSLATE_PROCESSOR_NAME } from './translate-worklet'
import {
  VoiceTranslateEvents,
  type IVoiceTranslationTransport,
  type SameLanguageSpeech,
  type VoiceTranscriptChunk,
  type VoiceTranslateActivity,
  type VoiceTranslateError,
  type VoiceTranslateErrorFallback,
  type VoiceTranslateEventMap,
  type VoiceTranslateLatency,
  type VoiceTranslateReconnectReason,
  type VoiceTranslateSessionOptions,
  type VoiceTranslateState,
  type VoiceTranslateStatus,
} from './voice-translate.types'

// Переводчик — обработчик слота 'voice-translation' аудио-графа микрофона.
// Общая часть для всех сервисов: AudioWorklet (захват + ресемплинг до частоты сервиса, проигрывание
// с ресемплингом до частоты контекста), тишина до готовности перевода, замер задержки, транскрипты,
// состояние и события. Сеть и протокол — в транспорте (IVoiceTranslationTransport).

export interface VoiceTranslatorOptions {
  transport: IVoiceTranslationTransport
  // BCP-47 из transport.info.languages
  targetLanguage: string
  // Речь на целевом языке: 'pass' (по умолчанию) — пропускать, 'silence' — молчать
  sameLanguageSpeech?: SameLanguageSpeech
  // Громкость оригинала под переводом, 0..1 (по умолчанию 0 — только перевод)
  originalVolume?: number
  // Что звучит при ошибке сессии: 'original' (по умолчанию) или 'silence'
  errorFallback?: VoiceTranslateErrorFallback
  // RMS чанка, выше которого человек говорит (0..1, ~ -40 dBFS) — для замера задержки и activity
  voiceThreshold?: number
  // Пауза, после которой фраза закончена, мс
  phraseGapMs?: number
}

interface Phrase {
  startAt: number
  endAt: number | null
  firstAudioAt: number | null
  finishAt: number | null
}

interface WorkletMessage {
  type: 'chunk' | 'playing' | 'drained'
  pcm?: ArrayBuffer
  rms?: number
}

const TURN_TEXT_LIMIT = 4000
const USAGE_EMIT_INTERVAL_MS = 1000

const EMPTY_LATENCY: VoiceTranslateLatency = {
  lastStartToFirstAudioMs: null,
  lastEndToFirstAudioMs: null,
  lastEndToFinishMs: null,
  avgStartToFirstAudioMs: null,
  avgEndToFinishMs: null,
  samples: 0,
}

const average = (values: number[]): number | null =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

export class VoiceTranslator extends TypedEventEmitter<VoiceTranslateEventMap> implements IAudioProcessorProvider {
  readonly transport: IVoiceTranslationTransport

  private session: VoiceTranslateSessionOptions
  private originalVolume: number
  private errorFallback: VoiceTranslateErrorFallback
  private voiceThreshold: number
  private phraseGapMs: number

  private node: AudioWorkletNode | null = null
  private state: VoiceTranslateState
  private isReady = false
  private isSessionOpen = false
  private pendingReconnect = false
  private isInputPaused = false
  private hasEndedAudioStream = false
  private lastUsageEmitAt = 0

  // Транскрипты текущего хода
  private turnText = { input: '', output: '' }

  // Замер задержки: звук перевода относится к последней начатой фразе
  private phrase: Phrase | null = null
  private lastVoiceAt: number | null = null
  private isPlaying = false
  private startLags: number[] = []
  private finishLags: number[] = []

  constructor(options: VoiceTranslatorOptions) {
    super()
    this.transport = options.transport
    this.session = {
      targetLanguage: options.targetLanguage,
      sameLanguageSpeech: options.sameLanguageSpeech ?? 'pass',
    }
    this.originalVolume = clamp01(options.originalVolume ?? 0)
    this.errorFallback = options.errorFallback ?? 'original'
    this.voiceThreshold = options.voiceThreshold ?? 0.01
    this.phraseGapMs = options.phraseGapMs ?? 700
    this.state = this.createInitialState()
  }

  get providerId(): string {
    return this.transport.info.id
  }

  // ── IAudioProcessorProvider ──

  async createNode(context: AudioContext): Promise<AudioNode> {
    // Граф перезапущен (новый трек): прежний узел уже не нужен, сессию открываем заново
    const isRestart = this.node !== null || this.isSessionOpen
    this.releaseNode()

    if (typeof context.audioWorklet === 'undefined' || typeof WebSocket === 'undefined') {
      const error = { reason: 'unsupported' as const, message: 'AudioWorklet or WebSocket is not available in this browser' }
      this.fail(error)
      throw new Error(error.message)
    }

    await loadTranslateWorklet(context)
    const { format } = this.transport.info
    const node = new AudioWorkletNode(context, TRANSLATE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        inputRate: format.inputSampleRate,
        outputRate: format.outputSampleRate,
        chunkMs: format.chunkMs,
        originalVolume: this.originalVolume,
      },
    })
    node.port.onmessage = (e: MessageEvent<WorkletMessage>) => this.handleWorkletMessage(e.data)
    this.node = node

    if (isRestart) this.emit(VoiceTranslateEvents.RECONNECTING, { reason: 'graph-restarted' })
    this.openSession(isRestart)
    return node
  }

  // Граф остановлен (микрофон выключен): закрыть сессию, чтобы не платить за тишину
  releaseNode(): void {
    this.closeSession()
    if (this.node) {
      this.node.port.onmessage = null
      this.node.disconnect()
      this.node = null
    }
    this.phrase = null
    this.lastVoiceAt = null
    this.isPlaying = false
    this.resetTurn()
    if (this.state.status !== 'idle') this.setStatus('idle', null)
    this.setActivity('silent')
  }

  destroy(): void {
    this.releaseNode()
  }

  // ── Управление ──

  getState(): VoiceTranslateState {
    return this.state
  }

  getSessionOptions(): VoiceTranslateSessionOptions {
    return { ...this.session }
  }

  // Смена языка переподключает сессию (одна сессия — один целевой язык)
  setTargetLanguage(targetLanguage: string): void {
    if (targetLanguage === this.session.targetLanguage) return
    this.session = { ...this.session, targetLanguage }
    this.patch({ targetLanguage })
    this.reconnect('language-changed')
  }

  setSameLanguageSpeech(mode: SameLanguageSpeech): void {
    if (mode === this.session.sameLanguageSpeech) return
    this.session = { ...this.session, sameLanguageSpeech: mode }
    this.reconnect('options-changed')
  }

  setOriginalVolume(volume: number): void {
    this.originalVolume = clamp01(volume)
    this.node?.port.postMessage({ type: 'originalVolume', value: this.originalVolume })
  }

  getOriginalVolume(): number {
    return this.originalVolume
  }

  setErrorFallback(fallback: VoiceTranslateErrorFallback): void {
    this.errorFallback = fallback
    if (this.state.status === 'error') this.setPassthrough(fallback === 'original')
  }

  // Не отправлять звук (микрофон заглушён) — сервис не считает тишину
  setInputPaused(isPaused: boolean): void {
    if (isPaused === this.isInputPaused) return
    this.isInputPaused = isPaused
    if (isPaused && this.isReady && !this.hasEndedAudioStream) {
      this.transport.endAudioStream?.()
      this.hasEndedAudioStream = true
    }
    if (!isPaused) this.hasEndedAudioStream = false
    this.patch({ isInputPaused: isPaused })
    this.emit(VoiceTranslateEvents.INPUT_PAUSED, { isPaused })
  }

  // ── Сессия ──

  private openSession(isReconnect: boolean): void {
    this.isSessionOpen = true
    this.pendingReconnect = isReconnect
    this.isReady = false
    this.hasEndedAudioStream = false
    this.setStatus('connecting', null)

    try {
      this.transport.connect(this.session, {
        onOpen: () => this.emitRaw('open', null),
        onReady: () => this.handleReady(),
        onAudio: (pcm) => this.handleTranslatedAudio(pcm),
        onTranscript: (chunk) => this.handleTranscript(chunk),
        onInterrupted: () => {
          this.node?.port.postMessage({ type: 'clear' })
          this.emit(VoiceTranslateEvents.INTERRUPTED)
        },
        onTurnComplete: () => this.completeTurn(),
        onReconnecting: (reason) => this.handleTransportReconnecting(reason),
        onError: (error) => this.fail(error),
        onClose: (close) => this.handleClose(close),
        onRawEvent: (type, data) => this.emitRaw(type, data),
      })
    } catch (error) {
      this.fail({ reason: 'unknown', message: error instanceof Error ? error.message : String(error) })
    }
  }

  private closeSession(): void {
    if (!this.isSessionOpen) return
    this.isSessionOpen = false
    this.isReady = false
    this.transport.close()
  }

  private reconnect(reason: VoiceTranslateReconnectReason): void {
    if (!this.node) return // сессии нет (микрофон выключен) — новые параметры возьмёт следующая
    this.emit(VoiceTranslateEvents.RECONNECTING, { reason })
    this.closeSession()
    this.node.port.postMessage({ type: 'clear' })
    this.resetTurn()
    this.openSession(true)
  }

  private handleReady(): void {
    this.isReady = true
    this.setPassthrough(false)
    this.setStatus('active', null)
    this.emit(VoiceTranslateEvents.SESSION_OPENED, {
      providerId: this.providerId,
      targetLanguage: this.session.targetLanguage,
      isReconnect: this.pendingReconnect,
    })
    this.pendingReconnect = false
  }

  private handleTransportReconnecting(reason: VoiceTranslateReconnectReason): void {
    this.isReady = false
    this.pendingReconnect = true
    this.emit(VoiceTranslateEvents.RECONNECTING, { reason })
    if (this.state.status !== 'error') this.setStatus('connecting', null)
  }

  private handleClose(close: { code?: number; reason?: string; willReconnect: boolean }): void {
    this.isReady = false
    this.emit(VoiceTranslateEvents.SESSION_CLOSED, close)
    if (close.willReconnect) return
    this.isSessionOpen = false
    if (this.state.status !== 'error') this.setStatus('idle', null)
    this.setActivity('silent')
  }

  // ── Звук ──

  private handleWorkletMessage(msg: WorkletMessage): void {
    const now = performance.now()
    if (msg.type === 'chunk' && msg.pcm) {
      this.trackVoice(now, msg.rms ?? 0)
      // До готовности сессии и на паузе звук не копим и не шлём: на выходе и так тишина
      if (!this.isReady || this.isInputPaused) return
      const pcm = new Int16Array(msg.pcm)
      this.transport.sendAudio(pcm)
      this.state.usage.inputSeconds += pcm.length / this.transport.info.format.inputSampleRate
      this.maybeEmitUsage(now)
      return
    }
    if (msg.type === 'playing') {
      this.isPlaying = true
      if (this.phrase && this.phrase.firstAudioAt === null) {
        this.phrase.firstAudioAt = now
        this.startLags.push(Math.round(now - this.phrase.startAt))
        this.updateLatency()
      }
      this.updateActivity(now)
      return
    }
    if (msg.type === 'drained') {
      this.isPlaying = false
      if (this.phrase && this.phrase.firstAudioAt !== null) {
        this.phrase.finishAt = now
        this.updateLatency()
      }
      this.updateActivity(now)
    }
  }

  private handleTranslatedAudio(pcm: Int16Array): void {
    if (!this.node || pcm.length === 0) return
    let sumSq = 0
    let peak = 0
    for (let i = 0; i < pcm.length; i++) {
      const v = Math.abs(pcm[i] / 32768)
      sumSq += v * v
      if (v > peak) peak = v
    }
    const copy = pcm.slice()
    this.node.port.postMessage({ type: 'play', pcm: copy.buffer }, [copy.buffer])

    const seconds = pcm.length / this.transport.info.format.outputSampleRate
    this.state.usage.outputSeconds += seconds
    this.emit(VoiceTranslateEvents.TRANSLATED_AUDIO, {
      durationMs: Math.round(seconds * 1000),
      rms: Math.sqrt(sumSq / pcm.length),
      peak,
    })
    this.maybeEmitUsage(performance.now())
  }

  private setPassthrough(isOn: boolean): void {
    this.node?.port.postMessage({ type: 'passthrough', value: isOn })
  }

  // ── Транскрипты ──

  private handleTranscript(chunk: VoiceTranscriptChunk): void {
    if (!chunk.isInterim) {
      this.turnText[chunk.kind] = (this.turnText[chunk.kind] + chunk.text).slice(-TURN_TEXT_LIMIT)
    }
    if (chunk.kind === 'input' && chunk.languageCode && chunk.languageCode !== this.state.detectedLanguage) {
      const previous = this.state.detectedLanguage
      this.patch({ detectedLanguage: chunk.languageCode })
      this.emit(VoiceTranslateEvents.LANGUAGE_DETECTED, { languageCode: chunk.languageCode, previous })
    }
    this.emit(VoiceTranslateEvents.TRANSCRIPT, {
      ...chunk,
      turnText: this.turnText[chunk.kind],
      isFinal: false,
      timestamp: Date.now(),
    })
  }

  private completeTurn(): void {
    const { input, output } = this.turnText
    const timestamp = Date.now()
    if (input) this.emit(VoiceTranslateEvents.TRANSCRIPT, { kind: 'input', text: '', isInterim: false, turnText: input, isFinal: true, timestamp, languageCode: this.state.detectedLanguage ?? undefined })
    if (output) this.emit(VoiceTranslateEvents.TRANSCRIPT, { kind: 'output', text: '', isInterim: false, turnText: output, isFinal: true, timestamp, languageCode: this.session.targetLanguage })
    this.emit(VoiceTranslateEvents.TURN_COMPLETE, { inputText: input, outputText: output })
    this.resetTurn()
  }

  private resetTurn(): void {
    this.turnText = { input: '', output: '' }
  }

  // ── Замер задержки ──

  private trackVoice(now: number, rms: number): void {
    if (rms >= this.voiceThreshold) {
      const isNewPhrase = this.lastVoiceAt === null || now - this.lastVoiceAt > this.phraseGapMs
      if (isNewPhrase) {
        this.phrase = { startAt: now, endAt: null, firstAudioAt: null, finishAt: null }
        this.finishLags.push(-1)
      }
      this.lastVoiceAt = now
    } else if (this.phrase && this.phrase.endAt === null && this.lastVoiceAt !== null && now - this.lastVoiceAt > this.phraseGapMs) {
      this.phrase.endAt = this.lastVoiceAt
      this.updateLatency()
    }
    this.updateActivity(now)
  }

  private updateLatency(): void {
    const p = this.phrase
    if (!p) return
    const latency = { ...this.state.latency }
    latency.lastStartToFirstAudioMs = p.firstAudioAt !== null ? Math.round(p.firstAudioAt - p.startAt) : null
    latency.avgStartToFirstAudioMs = average(this.startLags)

    if (p.endAt !== null) {
      latency.lastEndToFirstAudioMs = p.firstAudioAt !== null && p.firstAudioAt > p.endAt ? Math.round(p.firstAudioAt - p.endAt) : null
      if (p.finishAt !== null && p.finishAt > p.endAt) {
        latency.lastEndToFinishMs = Math.round(p.finishAt - p.endAt)
        this.finishLags[this.finishLags.length - 1] = latency.lastEndToFinishMs
      }
    } else {
      latency.lastEndToFirstAudioMs = null
    }
    const finished = this.finishLags.filter((v) => v >= 0)
    latency.avgEndToFinishMs = average(finished)
    latency.samples = finished.length
    this.patch({ latency })
    this.emit(VoiceTranslateEvents.LATENCY_CHANGED, latency)
  }

  private updateActivity(now: number): void {
    // Перевода нет (ошибка, сессия закрыта) — activity не про перевод, держим 'silent'
    if (this.state.status === 'error' || this.state.status === 'idle') {
      this.setActivity('silent')
      return
    }
    const isSpeaking = this.lastVoiceAt !== null && now - this.lastVoiceAt <= this.phraseGapMs
    this.setActivity(this.isPlaying ? 'translating' : isSpeaking ? 'listening' : 'silent')
  }

  // ── Состояние ──

  private createInitialState(): VoiceTranslateState {
    return {
      isEnabled: true,
      status: 'idle',
      error: null,
      activity: 'silent',
      providerId: this.transport.info.id,
      targetLanguage: this.session.targetLanguage,
      detectedLanguage: null,
      isInputPaused: false,
      latency: { ...EMPTY_LATENCY },
      usage: { inputSeconds: 0, outputSeconds: 0 },
    }
  }

  private fail(error: Omit<VoiceTranslateError, 'providerId'>): void {
    this.isReady = false
    const full: VoiceTranslateError = { ...error, providerId: this.providerId }
    this.setPassthrough(this.errorFallback === 'original')
    this.setStatus('error', full)
    this.setActivity('silent')
    this.emit(VoiceTranslateEvents.ERROR, full)
  }

  private setStatus(status: VoiceTranslateStatus, error: VoiceTranslateError | null): void {
    const previous = this.state.status
    if (previous === status && this.state.error === error) return
    this.patch({ status, error })
    this.emit(VoiceTranslateEvents.STATUS_CHANGED, { status, previous, error })
  }

  private setActivity(activity: VoiceTranslateActivity): void {
    const previous = this.state.activity
    if (previous === activity) return
    this.patch({ activity })
    this.emit(VoiceTranslateEvents.ACTIVITY_CHANGED, { activity, previous })
  }

  private maybeEmitUsage(now: number): void {
    if (now - this.lastUsageEmitAt < USAGE_EMIT_INTERVAL_MS) return
    this.lastUsageEmitAt = now
    this.emit(VoiceTranslateEvents.USAGE_CHANGED, { ...this.state.usage })
  }

  private emitRaw(type: string, data: unknown): void {
    this.emit(VoiceTranslateEvents.PROVIDER_EVENT, { providerId: this.providerId, type, data })
  }

  private patch(partial: Partial<VoiceTranslateState>): void {
    this.state = { ...this.state, ...partial }
    this.emit(VoiceTranslateEvents.STATE_CHANGED, this.state)
  }
}
