import { ConfigurationService } from '../../configuration'
import { MediaStreamService } from '../../media-stream'
import { TranscriptionService } from '../transcription.service'
import { MediaErrorEvent, MediaEvents } from '../../types'
import { TranscriptCallback, TranscriptionEvents, TranscriptionState, TranscriptionStateChangeCallback, TranscriptItem } from '../transcription.types'

export class TranscriptionController {
  private stateCallbacks = new Set<TranscriptionStateChangeCallback>()
  private transcriptCallbacks = new Set<TranscriptCallback>()
  private errorCallbacks = new Set<(error: MediaErrorEvent) => void>()

  private unsubscribers: VoidFunction[] = []

  constructor(
    private configService: ConfigurationService,
    private transcriptionService: TranscriptionService,
    private mediaStreamService: MediaStreamService,
  ) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.unsubscribers.push(
      this.transcriptionService.on(TranscriptionEvents.TRANSCRIPT, (data) => {
        this._notifyTranscript(data)
      }),
      this.transcriptionService.on(TranscriptionEvents.ERROR, (error) => {
        this._notifyError({ source: 'transcription', error })
      }),
      this.transcriptionService.on(TranscriptionEvents.STARTED, () => {
        this._notifyStateChange(this.state)
      }),
      this.transcriptionService.on(TranscriptionEvents.STOPPED, () => {
        this._notifyStateChange(this.state)
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_ADDED, (event) => {
        if (event.kind === 'audio' && this.configService.getTranscriptionConfig().autoStart) {
          this.start().catch((error) => {
            this._notifyError({ source: 'transcription', action: 'autoStart', error })
          })
        }
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_REMOVED, (event) => {
        if (event.kind === 'audio') {
          this.stop()
        }
      }),
      this.configService.on('transcriptionConfigChanged', async (event) => {
        await this.handleConfigurationChange(event)
      }),
    )
  }

  private async handleConfigurationChange(event: any): Promise<void> {
    if (!this.state.isActive) return

    try {
      if (event.property === 'language') {
        await this.restart()
      }
    } catch (error) {
      this._notifyError({ source: 'transcription', action: 'configUpdate', error })
    }
  }

  start = async (): Promise<void> => {
    try {
      await this.transcriptionService.startTranscription()
    } catch (error) {
      this._notifyError({ source: 'transcription', action: 'start', error })
      throw error
    }
  }

  stop = (): void => {
    this.transcriptionService.stopTranscription()
  }

  toggle = (): Promise<void> => {
    if (this.state.isActive) {
      this.stop()
      return Promise.resolve()
    } else {
      return this.start()
    }
  }

  updateLanguage = (language: string): void => {
    this.configService.setTranscriptionLanguage(language)
  }

  getTranscripts = (): TranscriptItem[] => {
    return this.transcriptionService.getTranscripts()
  }

  clearTranscripts = (): void => {
    this.transcriptionService.clearTranscripts()
  }

  private async restart(): Promise<void> {
    if (this.state.isActive) {
      this.stop()
      // Небольшая задержка перед перезапуском
      await new Promise((resolve) => setTimeout(resolve, 100))
      await this.start()
    }
  }

  get state(): TranscriptionState {
    return {
      isActive: this.transcriptionService.active,
      isSupported: this.transcriptionService.isSupported,
      currentLanguage: this.configService.getTranscriptionConfig().language,
    }
  }

  onTranscript = (callback: TranscriptCallback): VoidFunction => {
    this.transcriptCallbacks.add(callback)
    return () => this.transcriptCallbacks.delete(callback)
  }

  onStateChange = (callback: TranscriptionStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onError = (callback: (error: MediaErrorEvent) => void): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private _notifyTranscript(transcript: TranscriptItem): void {
    this.transcriptCallbacks.forEach((callback) => callback(transcript))
  }

  private _notifyStateChange(state: TranscriptionState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyError(error: MediaErrorEvent): void {
    this.errorCallbacks.forEach((callback) => callback(error))
  }

  destroy(): void {
    this.unsubscribers.forEach((fn) => fn())
    this.unsubscribers = []
    this.stateCallbacks.clear()
    this.transcriptCallbacks.clear()
    this.errorCallbacks.clear()
  }
}
