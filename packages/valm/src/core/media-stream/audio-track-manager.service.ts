import { AudioConfiguration } from '../configuration/configuration.types'
import { TypedEventEmitter } from '../utils'
import { VoiceActivityDetector, VoiceActivityDetectorFactory } from '../utils'
import { ConstraintsBuilderService } from './constraints-builder.service'

export enum AudioTrackEvents {
  TRACK_ADDED = 'trackAdded',
  TRACK_REMOVED = 'trackRemoved',
  TRACK_REPLACED = 'trackReplaced',
  TRACK_MUTED = 'trackMuted',
  TRACK_UNMUTED = 'trackUnmuted',
  STATE_CHANGED = 'stateChanged',
  VOLUME_CHANGE = 'volumeChange',
  ERROR = 'error',
}

export interface AudioTrackState {
  track: MediaStreamTrack | null
  isEnabled: boolean
  isMuted: boolean
  isSpeaking: boolean
  volume: number
  deviceId: string | null
  settings: MediaTrackSettings | null
}

export interface AudioTrackEventPayload {
  track: MediaStreamTrack
  oldTrack?: MediaStreamTrack
}

export interface VolumeChangePayload {
  isSpeaking: boolean
  volume: number
}

interface AudioTrackEventMap {
  [AudioTrackEvents.TRACK_ADDED]: (payload: AudioTrackEventPayload) => void
  [AudioTrackEvents.TRACK_REMOVED]: (payload: AudioTrackEventPayload) => void
  [AudioTrackEvents.TRACK_REPLACED]: (payload: AudioTrackEventPayload) => void
  [AudioTrackEvents.TRACK_MUTED]: (payload: AudioTrackEventPayload) => void
  [AudioTrackEvents.TRACK_UNMUTED]: (payload: AudioTrackEventPayload) => void
  [AudioTrackEvents.STATE_CHANGED]: (state: AudioTrackState) => void
  [AudioTrackEvents.VOLUME_CHANGE]: (payload: VolumeChangePayload) => void
  [AudioTrackEvents.ERROR]: (error: Error) => void
}

export class AudioTrackManagerService extends TypedEventEmitter<AudioTrackEventMap> {
  private track: MediaStreamTrack | null = null
  private isEnabled = false
  private isMuted = false
  private isSpeaking = false
  private volume = 0

  private vad: VoiceActivityDetector | null = null

  private pendingSwitch: Promise<void> | null = null
  private abortController: AbortController | null = null

  private lastEmittedState: AudioTrackState | null = null

  constructor(
    private getConfig: () => AudioConfiguration,
    private createVAD?: VoiceActivityDetectorFactory,
  ) {
    super()
  }

  // Включить аудио (получить трек с микрофона)
  async enable(): Promise<MediaStreamTrack | null> {
    try {
      if (this.track) {
        // Трек уже есть — просто включаем
        this.track.enabled = true
        this.isMuted = false
        this.initVAD(this.track)
        this.emit(AudioTrackEvents.TRACK_UNMUTED, { track: this.track })
      } else {
        // Создаём новый трек
        await this.acquireTrack()
      }

      this.isEnabled = true
      this.emitStateIfChanged()
      return this.track
    } catch (error) {
      this.handleError('Failed to enable audio', error)
      return null
    }
  }

  // Включить аудио с уже существующим треком (preview → publish)
  async enableWithTrack(track: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    try {
      if (this.track) {
        this.disable()
      }

      this.track = track
      this.isEnabled = true
      this.isMuted = false

      track.addEventListener('ended', () => this.handleTrackEnded(track))

      this.initVAD(track)

      this.emit(AudioTrackEvents.TRACK_ADDED, { track })
      this.emitStateIfChanged()
      return track
    } catch (error) {
      this.handleError('Failed to enable audio with track', error)
      return null
    }
  }

  // Выключить аудио и освободить трек
  disable(): void {
    if (this.track) {
      const removedTrack = this.track

      this.destroyVAD()
      this.track.stop()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(AudioTrackEvents.TRACK_REMOVED, { track: removedTrack })
      this.emitStateIfChanged()
    } else {
      this.isEnabled = false
      this.emitStateIfChanged()
    }
  }

  // Заглушить аудио (трек остаётся, но не передаёт данные)
  mute(): void {
    if (this.track) {
      this.track.enabled = false
      this.isMuted = true
      this.destroyVAD()
      this.emit(AudioTrackEvents.TRACK_MUTED, { track: this.track })
      this.emitStateIfChanged()
    }
  }

  // Снять приглушение
  unmute(): void {
    if (this.track) {
      this.track.enabled = true
      this.isMuted = false
      this.initVAD(this.track)
      this.emit(AudioTrackEvents.TRACK_UNMUTED, { track: this.track })
      this.emitStateIfChanged()
    }
  }

  // Переключить микрофон на другое устройство
  async switchDevice(deviceId?: string): Promise<void> {
    // Отменяем предыдущую операцию если есть
    if (this.abortController) {
      this.abortController.abort()
    }

    // Ждём завершения предыдущего переключения
    if (this.pendingSwitch) {
      try {
        await this.pendingSwitch
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          throw error
        }
      }
    }

    // Проверяем нужно ли переключать
    const currentDeviceId = this.track?.getSettings().deviceId
    const targetDeviceId = deviceId ?? this.getConfig().deviceId

    if (currentDeviceId && targetDeviceId && currentDeviceId === targetDeviceId && this.isTrackActive()) {
      return
    }

    this.abortController = new AbortController()
    const currentAbortController = this.abortController

    const switchOperation = (async () => {
      if (this.isTrackActive()) {
        await this.replaceTrack(currentAbortController, deviceId)
      } else if (this.isEnabled) {
        await this.acquireTrack(currentAbortController, deviceId)
      }

      if (this.abortController === currentAbortController) {
        this.abortController = null
      }

      this.emitStateIfChanged()
    })()

    this.pendingSwitch = switchOperation

    try {
      await switchOperation
    } finally {
      if (this.pendingSwitch === switchOperation) {
        this.pendingSwitch = null
      }
    }
  }

  getTrack(): MediaStreamTrack | null {
    return this.track
  }

  getState(): AudioTrackState {
    return {
      track: this.track,
      isEnabled: this.isEnabled,
      isMuted: this.isMuted,
      isSpeaking: this.isSpeaking,
      volume: this.volume,
      deviceId: this.track?.getSettings().deviceId ?? null,
      settings: this.track?.getSettings() ?? null,
    }
  }

  // Уничтожить менеджер и освободить ресурсы
  destroy(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.destroyVAD()
    this.disable()
    this.removeAllListeners()
  }

  private async acquireTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    let tempStream: MediaStream | null = null

    try {
      const config = this.getConfig()
      const effectiveConfig = deviceId ? { ...config, deviceId } : config
      const constraints = ConstraintsBuilderService.buildAudioConstraints(effectiveConfig)

      if (abortController?.signal.aborted) {
        throw new DOMException('Operation aborted', 'AbortError')
      }

      tempStream = await navigator.mediaDevices.getUserMedia({ audio: constraints })

      if (abortController?.signal.aborted) {
        tempStream.getTracks().forEach((t) => t.stop())
        throw new DOMException('Operation aborted', 'AbortError')
      }

      const newTrack = tempStream.getAudioTracks()[0]
      this.track = newTrack
      this.isEnabled = true
      this.isMuted = false

      newTrack.addEventListener('ended', () => this.handleTrackEnded(newTrack))

      this.initVAD(newTrack)

      this.emit(AudioTrackEvents.TRACK_ADDED, { track: newTrack })
    } catch (error) {
      if (tempStream) {
        tempStream.getTracks().forEach((t) => t.stop())
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      throw error
    }
  }

  private async replaceTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    let tempStream: MediaStream | null = null

    try {
      const oldTrack = this.track
      const config = this.getConfig()
      const effectiveConfig = deviceId ? { ...config, deviceId } : config
      const constraints = ConstraintsBuilderService.buildAudioConstraints(effectiveConfig)

      if (abortController?.signal.aborted) {
        throw new DOMException('Operation aborted', 'AbortError')
      }

      tempStream = await navigator.mediaDevices.getUserMedia({ audio: constraints })

      if (abortController?.signal.aborted) {
        tempStream.getTracks().forEach((t) => t.stop())
        throw new DOMException('Operation aborted', 'AbortError')
      }

      const newTrack = tempStream.getAudioTracks()[0]

      // Останавливаем VAD перед заменой
      this.destroyVAD()

      if (oldTrack) {
        oldTrack.stop()
        this.emit(AudioTrackEvents.TRACK_REMOVED, { track: oldTrack })
      }

      this.track = newTrack
      newTrack.addEventListener('ended', () => this.handleTrackEnded(newTrack))

      // Запускаем VAD для нового трека
      this.initVAD(newTrack)

      this.emit(AudioTrackEvents.TRACK_ADDED, { track: newTrack })

      if (oldTrack) {
        this.emit(AudioTrackEvents.TRACK_REPLACED, { track: newTrack, oldTrack })
      }
    } catch (error) {
      if (tempStream) {
        tempStream.getTracks().forEach((t) => t.stop())
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      throw error
    }
  }

  private initVAD(track: MediaStreamTrack): void {
    if (!this.createVAD) return

    this.destroyVAD()

    const config = this.getConfig()

    this.vad = this.createVAD({
      volumeThreshold: config.volumeThreshold ?? 10,
      silenceTimeout: 400,
    })

    this.vad.start(track)

    this.vad.onStateChange(({ isSpeaking, volume }) => {
      this.isSpeaking = isSpeaking
      this.volume = volume

      this.emit(AudioTrackEvents.VOLUME_CHANGE, { isSpeaking, volume } as VolumeChangePayload)
      this.emitStateIfChanged()
    })
  }

  private destroyVAD(): void {
    if (this.vad) {
      this.vad.stop()
      this.vad = null
    }

    this.isSpeaking = false
    this.volume = 0

    this.emit(AudioTrackEvents.VOLUME_CHANGE, {
      isSpeaking: false,
      volume: 0,
    } as VolumeChangePayload)
  }

  // Микрофон отключён или трек завершился
  private handleTrackEnded(track: MediaStreamTrack): void {
    if (this.track === track) {
      this.destroyVAD()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(AudioTrackEvents.TRACK_REMOVED, { track })
      this.emitStateIfChanged()
    }
  }

  private isTrackActive(): boolean {
    return this.track !== null && this.track.readyState === 'live'
  }

  private emitStateIfChanged(): void {
    const currentState = this.getState()

    if (
      !this.lastEmittedState ||
      this.lastEmittedState.isEnabled !== currentState.isEnabled ||
      this.lastEmittedState.isMuted !== currentState.isMuted ||
      this.lastEmittedState.isSpeaking !== currentState.isSpeaking ||
      this.lastEmittedState.volume !== currentState.volume ||
      this.lastEmittedState.deviceId !== currentState.deviceId ||
      (this.lastEmittedState.track !== null) !== (currentState.track !== null)
    ) {
      this.lastEmittedState = currentState
      this.emit(AudioTrackEvents.STATE_CHANGED, currentState)
    }
  }

  private handleError(message: string, error: unknown): void {
    const finalError = error instanceof Error ? error : new Error(message)
    this.emit(AudioTrackEvents.ERROR, finalError)
    throw finalError
  }
}
