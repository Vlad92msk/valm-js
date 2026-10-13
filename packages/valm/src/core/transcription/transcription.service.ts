import { ConfigurationService } from '../configuration'
import { TypedEventEmitter } from '../utils'
import { getSpeechRecognitionConstructor, isSpeechRecognitionSupported } from './speech-recognition.types'
import {
  TranscriptEvent,
  TranscriptionError,
  TranscriptionErrorCode,
  TranscriptionEvents,
  TranscriptionStatus,
  TranscriptionStopReason,
  TranscriptItem,
} from './transcription.types'

interface TranscriptionEventMap {
  [TranscriptionEvents.STARTED]: VoidFunction
  [TranscriptionEvents.STOPPED]: (reason: TranscriptionStopReason) => void
  [TranscriptionEvents.STATUS_CHANGED]: (status: TranscriptionStatus) => void
  [TranscriptionEvents.TRANSCRIPT]: (transcript: TranscriptItem) => void
  [TranscriptionEvents.TRANSCRIPT_EVENT]: (event: TranscriptEvent) => void
  [TranscriptionEvents.ERROR]: (error: TranscriptionError) => void
}

const FATAL_ERRORS: TranscriptionErrorCode[] = ['not-allowed', 'service-not-allowed', 'language-not-supported', 'bad-grammar', 'audio-capture']

const RESTART_DELAY_MS = 100
const MIN_SESSION_MS = 1000
const BACKOFF_MIN_MS = 1000
const BACKOFF_MAX_MS = 30000

export class TranscriptionService extends TypedEventEmitter<TranscriptionEventMap> {
  private recognition: SpeechRecognition | null = null
  // Экземпляры, чьи результаты больше не нужны (mute, перезапуск)
  private muted = new WeakSet<SpeechRecognition>()
  // Намерение: распознавание запрошено и не остановлено
  private requested = false
  private paused = false
  private currentStatus: TranscriptionStatus = 'idle'
  private lastStopReason: TranscriptionStopReason | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private backoffMs = 0
  private transcripts: TranscriptItem[] = []

  constructor(private configService: ConfigurationService) {
    super()
  }

  get active(): boolean {
    return this.requested
  }

  get status(): TranscriptionStatus {
    return this.currentStatus
  }

  get stopReason(): TranscriptionStopReason | null {
    return this.lastStopReason
  }

  get isSupported(): boolean {
    return isSpeechRecognitionSupported()
  }

  async startTranscription(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('Speech recognition not supported')
    }

    if (this.requested) {
      return // Уже активно
    }

    if (!this.paused) {
      this.openSession()
    }

    this.requested = true
    this.lastStopReason = null
    this.backoffMs = 0
    this.currentStatus = this.paused ? 'paused' : 'starting'
    this.emit(TranscriptionEvents.STARTED)
  }

  stopTranscription(): void {
    if (!this.requested) return
    // stop(), а не abort(): последний результат сессии ещё дойдёт до подписчиков
    this.closeSession(false)
    this.finish('manual')
  }

  // Пауза без потери намерения: mute микрофона или его выключение
  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    if (!this.requested) return

    if (paused) {
      this.closeSession(true)
      this.setStatus('paused')
    } else {
      this.reopenSession()
    }
  }

  // Применить изменившиеся language / interimResults
  restartTranscription(): void {
    if (!this.requested || this.paused) return
    this.closeSession(true)
    this.reopenSession()
  }

  getTranscripts(): TranscriptItem[] {
    return [...this.transcripts]
  }

  clearTranscripts(): void {
    this.transcripts = []
  }

  destroy(): void {
    if (this.requested) {
      this.closeSession(true)
      this.finish('manual')
    }
    this.transcripts = []
    this.removeAllListeners()
  }

  private openSession(): void {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionConstructor) {
      throw new Error('Speech recognition constructor not available')
    }

    const recognition = new SpeechRecognitionConstructor()
    const config = this.configService.getTranscriptionConfig()
    recognition.continuous = true
    recognition.interimResults = config.interimResults
    recognition.lang = config.language

    // Обработчики привязаны к своему экземпляру: события старой сессии не трогают новую
    let pendingError: TranscriptionErrorCode | null = null
    const openedAt = Date.now()

    recognition.onstart = () => {
      if (this.recognition !== recognition) return
      this.setStatus('listening')
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (this.muted.has(recognition)) return
      if (this.recognition === recognition) this.backoffMs = 0
      this.handleTranscriptionResult(event)
    }

    recognition.onerror = (error: SpeechRecognitionErrorEvent) => {
      if (this.recognition !== recognition) return
      pendingError = error.error
      this.emit(TranscriptionEvents.ERROR, { error, code: error.error, action: 'session' })
    }

    recognition.onend = () => {
      if (this.recognition !== recognition) return
      this.recognition = null

      if (pendingError && FATAL_ERRORS.includes(pendingError)) {
        this.finish('error')
        return
      }
      // Сессия распознавания одна на браузер: её забрала другая вкладка или сайт.
      // Перезапуск отобрал бы её обратно, и вкладки перебивали бы друг друга
      if (pendingError === 'aborted') {
        this.finish('aborted')
        return
      }

      // Тишина и штатное завершение — перезапуск сразу. Ошибка или сессия, закрывшаяся сразу после старта, — с растущей паузой
      const quick = pendingError === 'no-speech' || (pendingError === null && Date.now() - openedAt >= MIN_SESSION_MS)
      this.scheduleRestart(quick ? RESTART_DELAY_MS : this.nextBackoff())
    }

    this.recognition = recognition
    try {
      recognition.start()
    } catch (error) {
      this.recognition = null
      this.detach(recognition)
      throw error
    }
  }

  private reopenSession(): void {
    try {
      this.openSession()
      this.setStatus('starting')
    } catch (error) {
      this.emit(TranscriptionEvents.ERROR, { error, action: 'restart' })
      this.finish('error')
    }
  }

  private closeSession(discardResults: boolean): void {
    this.clearRestartTimer()
    const recognition = this.recognition
    if (!recognition) return
    this.recognition = null

    try {
      if (discardResults) {
        this.muted.add(recognition)
        recognition.abort()
      } else {
        recognition.stop()
      }
    } catch {
      // сессия уже завершена
    }
  }

  private detach(recognition: SpeechRecognition): void {
    recognition.onstart = null
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
  }

  private scheduleRestart(delayMs: number): void {
    this.clearRestartTimer()
    this.setStatus('restarting')
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.requested || this.paused || this.recognition) return
      this.reopenSession()
    }, delayMs)
  }

  private nextBackoff(): number {
    this.backoffMs = this.backoffMs ? Math.min(this.backoffMs * 2, BACKOFF_MAX_MS) : BACKOFF_MIN_MS
    return this.backoffMs
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private finish(reason: TranscriptionStopReason): void {
    this.clearRestartTimer()
    this.requested = false
    this.lastStopReason = reason
    this.currentStatus = 'idle'
    this.emit(TranscriptionEvents.STOPPED, reason)
  }

  private setStatus(status: TranscriptionStatus): void {
    if (this.currentStatus === status) return
    this.currentStatus = status
    this.emit(TranscriptionEvents.STATUS_CHANGED, status)
  }

  private handleTranscriptionResult(event: SpeechRecognitionEvent): void {
    const timestamp = Date.now()
    const save = this.configService.getTranscriptionConfig().saveTranscripts
    const items: TranscriptItem[] = []
    const final: string[] = []
    const interim: string[] = []

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      // До resultIndex — результаты прошлых событий; из них нужен только ещё не законченный текст
      if (i < event.resultIndex) {
        if (!result.isFinal) interim.push(result[0].transcript)
        continue
      }

      ;(result.isFinal ? final : interim).push(result[0].transcript)
      items.push({
        text: result[0].transcript,
        isFinal: result.isFinal,
        confidence: result[0].confidence,
        timestamp,
        resultIndex: i,
      })
    }

    if (save) this.transcripts.push(...items)

    items.forEach((item) => this.emit(TranscriptionEvents.TRANSCRIPT, item))
    this.emit(TranscriptionEvents.TRANSCRIPT_EVENT, { final: joinParts(final), interim: joinParts(interim), items, timestamp })
  }
}

// Chrome сам ставит пробел в начале следующей фразы, другие движки — нет
function joinParts(parts: string[]): string {
  return parts
    .reduce((text, part) => {
      if (!text || !part) return text + part
      const needsSpace = /[\p{L}\p{N}\p{P}]$/u.test(text) && /^[\p{L}\p{N}]/u.test(part) && !CJK.test(text.slice(-1)) && !CJK.test(part[0])
      return text + (needsSpace ? ' ' : '') + part
    }, '')
    .trim()
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
