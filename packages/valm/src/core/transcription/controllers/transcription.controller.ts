import { ConfigurationService } from '../../configuration'
import { MediaStreamService } from '../../media-stream'
import { TranscriptionService } from '../transcription.service'
import { ConfigurationChangeEvent, MediaErrorEvent, MediaEvents } from '../../types'
import {
  TranscriptCallback,
  TranscriptEvent,
  TranscriptEventCallback,
  TranscriptionConfiguration,
  TranscriptionEvents,
  TranscriptionState,
  TranscriptionStateChangeCallback,
  TranscriptItem,
} from '../transcription.types'

export class TranscriptionController {
  private stateCallbacks = new Set<TranscriptionStateChangeCallback>()
  private transcriptCallbacks = new Set<TranscriptCallback>()
  private transcriptEventCallbacks = new Set<TranscriptEventCallback>()
  private errorCallbacks = new Set<(error: MediaErrorEvent) => void>()

  private unsubscribers: VoidFunction[] = []

  // Микрофон выключили при запрошенном распознавании: ждём, пока он вернётся
  private waitingForMicrophone = false

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
      this.transcriptionService.on(TranscriptionEvents.TRANSCRIPT_EVENT, (data) => {
        this._notifyTranscriptEvent(data)
      }),
      this.transcriptionService.on(TranscriptionEvents.ERROR, ({ error, code, action }) => {
        this._notifyError({ source: 'transcription', action, error, code })
      }),
      this.transcriptionService.on(TranscriptionEvents.STARTED, () => {
        this._notifyStateChange(this.state)
      }),
      this.transcriptionService.on(TranscriptionEvents.STOPPED, () => {
        this.waitingForMicrophone = false
        this._notifyStateChange(this.state)
      }),
      this.transcriptionService.on(TranscriptionEvents.STATUS_CHANGED, () => {
        this._notifyStateChange(this.state)
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_ADDED, (event) => {
        if (event.kind !== 'audio') return
        this.waitingForMicrophone = false
        this.syncPause()
        if (!this.state.isActive && this.configService.getTranscriptionConfig().autoStart) {
          this.start().catch((error) => {
            this._notifyError({ source: 'transcription', action: 'autoStart', error })
          })
        }
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_REMOVED, (event) => {
        if (event.kind !== 'audio' || !this.state.isActive) return
        // Не stop(): распознавание вернётся вместе с микрофоном (смена устройства, выкл/вкл)
        this.waitingForMicrophone = true
        this.syncPause()
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_MUTED, (event) => {
        if (event.kind === 'audio') this.syncPause()
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_UNMUTED, (event) => {
        if (event.kind === 'audio') this.syncPause()
      }),
      this.configService.on('transcriptionConfigChanged', (event) => {
        this.handleConfigurationChange(event)
      }),
    )
  }

  // Web Speech API слушает системный микрофон сам и про mute в Valm не знает
  private syncPause(): void {
    const { hasAudio, isAudioMuted } = this.mediaStreamService.getState()
    const mutedPause = this.configService.getTranscriptionConfig().pauseOnMute && hasAudio && isAudioMuted
    this.transcriptionService.setPaused(this.waitingForMicrophone || mutedPause)
  }

  private handleConfigurationChange(event: ConfigurationChangeEvent): void {
    if (event.property === 'language') {
      if (event.oldValue === event.newValue) return
      this.transcriptionService.restartTranscription()
      this._notifyStateChange(this.state)
      return
    }

    // 'update' и 'reset' несут секцию целиком
    const before = event.oldValue as Partial<TranscriptionConfiguration> | undefined
    const after = event.newValue as Partial<TranscriptionConfiguration> | undefined
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return

    if (before.pauseOnMute !== after.pauseOnMute) this.syncPause()
    if (before.language !== after.language || before.interimResults !== after.interimResults) {
      this.transcriptionService.restartTranscription()
      if (before.language !== after.language) this._notifyStateChange(this.state)
    }
  }

  start = async (): Promise<void> => {
    try {
      // Явный start() при выключенном микрофоне слушает сразу: распознаванию трек Valm не нужен
      if (!this.state.isActive) this.waitingForMicrophone = false
      this.syncPause()
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

  get state(): TranscriptionState {
    return {
      isActive: this.transcriptionService.active,
      isSupported: this.transcriptionService.isSupported,
      currentLanguage: this.configService.getTranscriptionConfig().language,
      status: this.transcriptionService.status,
      stopReason: this.transcriptionService.stopReason,
    }
  }

  onTranscript = (callback: TranscriptCallback): VoidFunction => {
    this.transcriptCallbacks.add(callback)
    return () => this.transcriptCallbacks.delete(callback)
  }

  onTranscriptEvent = (callback: TranscriptEventCallback): VoidFunction => {
    this.transcriptEventCallbacks.add(callback)
    return () => this.transcriptEventCallbacks.delete(callback)
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

  private _notifyTranscriptEvent(event: TranscriptEvent): void {
    this.transcriptEventCallbacks.forEach((callback) => callback(event))
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
    this.transcriptEventCallbacks.clear()
    this.errorCallbacks.clear()
  }
}
