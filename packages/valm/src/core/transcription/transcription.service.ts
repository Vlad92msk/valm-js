import { ConfigurationService } from '../configuration/configuration.service'
import { TypedEventEmitter } from '../utils/typed-event-emitter'
import { getSpeechRecognitionConstructor, isSpeechRecognitionSupported } from './speech-recognition.types'
import { TranscriptionEvents, TranscriptItem } from './transcription.types'

/**
 * Типизированная карта событий TranscriptionService
 */
interface TranscriptionEventMap {
  [TranscriptionEvents.STARTED]: () => void
  [TranscriptionEvents.STOPPED]: () => void
  [TranscriptionEvents.TRANSCRIPT]: (transcript: TranscriptItem) => void
  [TranscriptionEvents.ERROR]: (error: unknown) => void
}

export class TranscriptionService extends TypedEventEmitter<TranscriptionEventMap> {
  private recognition: SpeechRecognition | null = null
  private isActive = false
  private transcripts: TranscriptItem[] = []

  constructor(private configService: ConfigurationService) {
    super()
  }

  get active(): boolean {
    return this.isActive
  }

  get isSupported(): boolean {
    return isSpeechRecognitionSupported()
  }

  async startTranscription(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('Speech recognition not supported')
    }

    if (this.isActive) {
      return // Уже активно
    }

    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionConstructor) {
      throw new Error('Speech recognition constructor not available')
    }

    this.recognition = new SpeechRecognitionConstructor()

    const config = this.configService.getTranscriptionConfig()
    this.recognition.continuous = true
    this.recognition.interimResults = config.interimResults
    this.recognition.lang = config.language

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleTranscriptionResult(event)
    }

    this.recognition.onerror = (error: SpeechRecognitionErrorEvent) => {
      const fatalErrors = ['not-allowed', 'service-not-allowed', 'language-not-supported', 'bad-grammar', 'audio-capture']
      if (fatalErrors.includes(error.error)) {
        this.isActive = false
      }
      this.emit(TranscriptionEvents.ERROR, error)
    }

    this.recognition.onend = () => {
      // Автоматический перезапуск, если еще активно
      if (this.isActive) {
        setTimeout(() => {
          if (this.isActive && this.recognition) {
            try {
              this.recognition.start()
            } catch (error) {
              // recognition.start() может бросить при быстрых повторных вызовах
              this.isActive = false
              this.emit(TranscriptionEvents.ERROR, error)
            }
          }
        }, 100)
      }
    }

    this.recognition.start()
    this.isActive = true
    this.emit(TranscriptionEvents.STARTED)
  }

  private handleTranscriptionResult(event: SpeechRecognitionEvent): void {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript: TranscriptItem = {
        text: result[0].transcript,
        isFinal: result.isFinal,
        confidence: result[0].confidence,
        timestamp: Date.now(),
      }

      if (this.configService.getTranscriptionConfig().saveTranscripts) {
        this.transcripts.push(transcript)
      }

      this.emit(TranscriptionEvents.TRANSCRIPT, transcript)
    }
  }

  stopTranscription(): void {
    if (this.recognition && this.isActive) {
      this.isActive = false
      this.recognition.stop()
      this.emit(TranscriptionEvents.STOPPED)
    }
  }

  getTranscripts(): TranscriptItem[] {
    return [...this.transcripts]
  }

  clearTranscripts(): void {
    this.transcripts = []
  }

  destroy(): void {
    this.stopTranscription()
    this.transcripts = []
    this.removeAllListeners()
  }
}
