import { AudioConfiguration } from '../configuration/configuration.types'
import { TypedEventEmitter } from '../utils'
import { VoiceActivityDetector, VoiceActivityDetectorFactory } from '../utils'
import { AudioProcessingPipelineService } from './audio-processing-pipeline.service'
import { ConstraintsBuilderService } from './constraints-builder.service'
import { getUserMediaWithFallback } from './device-fallback.helper'
import { DeviceFallbackEvent } from './device.types'
import { SwitchOutcome, TrackDeviceInfo, describeTrackDevice, runExclusiveOperation, SourceMuteReporter, ExclusiveState } from './track-manager.shared'

export enum AudioTrackEvents {
  TRACK_ADDED = 'trackAdded',
  TRACK_REMOVED = 'trackRemoved',
  TRACK_REPLACED = 'trackReplaced',
  TRACK_MUTED = 'trackMuted',
  TRACK_UNMUTED = 'trackUnmuted',
  STATE_CHANGED = 'stateChanged',
  VOLUME_CHANGE = 'volumeChange',
  SOURCE_MUTE_CHANGED = 'sourceMuteChanged',
  TRACK_ENDED = 'trackEnded',
  DEVICE_FALLBACK = 'deviceFallback',
  ERROR = 'error',
}

export interface AudioTrackState {
  track: MediaStreamTrack | null
  isEnabled: boolean
  isMuted: boolean
  isSourceMuted: boolean
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
  [AudioTrackEvents.SOURCE_MUTE_CHANGED]: (payload: { muted: boolean; track: MediaStreamTrack }) => void
  [AudioTrackEvents.TRACK_ENDED]: (device: TrackDeviceInfo) => void
  [AudioTrackEvents.DEVICE_FALLBACK]: (event: DeviceFallbackEvent) => void
  [AudioTrackEvents.ERROR]: (error: Error) => void
}

export class AudioTrackManagerService extends TypedEventEmitter<AudioTrackEventMap> {
  private track: MediaStreamTrack | null = null
  private isEnabled = false
  private isMuted = false
  private isSpeaking = false
  private volume = 0

  private vad: VoiceActivityDetector | null = null

  // Аудио-граф (gain/визуализация/ML); простаивает, пока не включён через engageProcessing
  private pipeline = new AudioProcessingPipelineService()
  private pipelineEngaged = false

  private exclusive: ExclusiveState = { pending: null, abortController: null }

  private detachTrackListeners: VoidFunction | null = null
  private sourceMute = new SourceMuteReporter(
    () => this.getConfig().sourceMuteDebounceMs ?? 0,
    (muted) => {
      const track = this.getOutputTrack()
      if (track) this.emit(AudioTrackEvents.SOURCE_MUTE_CHANGED, { muted, track })
      this.emitStateIfChanged()
    },
  )
  // Последнее открытое устройство; переживает 'ended' (для проверки отключения), сбрасывается в disable()
  private lastDevice: TrackDeviceInfo | null = null
  // Запрошенный deviceId, вместо которого открыт системный (deviceFallback: 'default')
  private fallbackFrom: string | null = null

  private lastEmittedState: AudioTrackState | null = null

  constructor(
    private getConfig: () => AudioConfiguration,
    private createVAD?: VoiceActivityDetectorFactory,
  ) {
    super()
  }

  getPipeline(): AudioProcessingPipelineService {
    return this.pipeline
  }

  // Оригинальный трек микрофона (без обработки графом)
  getRawTrack(): MediaStreamTrack | null {
    return this.track
  }

  getLastDevice(): TrackDeviceInfo | null {
    return this.lastDevice
  }

  getFallbackFrom(): string | null {
    return this.fallbackFrom
  }

  // Обработанный трек, если граф активен, иначе оригинальный
  getOutputTrack(): MediaStreamTrack | null {
    if (this.pipeline.isRunning()) {
      return this.pipeline.getOutputTrack() ?? this.track
    }
    return this.track
  }

  // Включить обработку: публиковать трек через Web Audio граф
  async engageProcessing(): Promise<void> {
    this.pipelineEngaged = true

    if (!this.track || this.pipeline.isRunning()) return

    const oldOutput = this.getOutputTrack()
    await this.pipeline.start(this.track)
    const newOutput = this.getOutputTrack()

    if (oldOutput && newOutput && oldOutput !== newOutput) {
      this.emit(AudioTrackEvents.TRACK_REPLACED, { track: newOutput, oldTrack: oldOutput })
    }
  }

  // Выключить обработку: вернуться к оригинальному треку
  disengageProcessing(): void {
    this.pipelineEngaged = false

    if (!this.pipeline.isRunning()) return

    const oldOutput = this.getOutputTrack()
    this.pipeline.stop()
    const newOutput = this.getOutputTrack()

    if (oldOutput && newOutput && oldOutput !== newOutput) {
      this.emit(AudioTrackEvents.TRACK_REPLACED, { track: newOutput, oldTrack: oldOutput })
    }
  }

  // Включить аудио (получить трек с микрофона)
  async enable(): Promise<MediaStreamTrack | null> {
    try {
      await this.runExclusive(async (abortController) => {
        if (this.track) {
          // Трек уже есть — просто включаем
          this.track.enabled = true
          this.isMuted = false
          this.initVAD(this.track)
          this.emit(AudioTrackEvents.TRACK_UNMUTED, { track: this.getOutputTrack()! })
        } else {
          // Создаём новый трек
          await this.acquireTrack(abortController)
        }

        this.isEnabled = true
        return 'replaced'
      })

      return this.getOutputTrack()
    } catch (error) {
      this.handleError('Failed to enable audio', error)
      return null
    }
  }

  // Включить аудио с уже существующим треком (preview → publish)
  async enableWithTrack(track: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    try {
      // Отменяем in-flight acquire/switch, иначе он позже перезапишет externalTrack
      this.exclusive.abortController?.abort()

      if (this.track) {
        this.disable()
      }

      this.setTrack(track)
      this.fallbackFrom = null
      this.isEnabled = true
      this.isMuted = false

      this.initVAD(track)
      await this.startPipelineIfEngaged()

      this.emit(AudioTrackEvents.TRACK_ADDED, { track: this.getOutputTrack()! })
      this.emitStateIfChanged()
      return this.getOutputTrack()
    } catch (error) {
      this.handleError('Failed to enable audio with track', error)
      return null
    }
  }

  // Выключить аудио и освободить трек
  disable(): void {
    // Отменяем in-flight acquire/switch, чтобы он не «воскресил» трек после выключения
    this.exclusive.abortController?.abort()
    this.lastDevice = null

    if (this.track) {
      const removedTrack = this.getOutputTrack()!

      this.destroyVAD()
      this.pipeline.stop()
      this.detachListeners()
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
      this.emit(AudioTrackEvents.TRACK_MUTED, { track: this.getOutputTrack()! })
      this.emitStateIfChanged()
    }
  }

  // Снять приглушение
  unmute(): void {
    if (this.track) {
      this.track.enabled = true
      this.isMuted = false
      this.initVAD(this.track)
      this.emit(AudioTrackEvents.TRACK_UNMUTED, { track: this.getOutputTrack()! })
      this.emitStateIfChanged()
    }
  }

  // Переключить микрофон на другое устройство.
  // force — переоткрыть даже тот же deviceId (например, 'default' после смены системного входа)
  async switchDevice(deviceId?: string, options?: { force?: boolean }): Promise<SwitchOutcome> {
    return this.runExclusive(async (abortController) => {
      // Проверяем нужно ли переключать
      const currentDeviceId = this.track?.getSettings().deviceId
      const targetDeviceId = deviceId ?? this.getConfig().deviceId

      if (!options?.force && currentDeviceId && targetDeviceId && currentDeviceId === targetDeviceId && this.isTrackActive()) {
        return 'noop'
      }

      if (this.isTrackActive()) {
        await this.replaceTrack(abortController, deviceId)
        return 'replaced'
      }
      if (this.isEnabled) {
        await this.acquireTrack(abortController, deviceId)
        return 'replaced'
      }
      return 'disabled'
    })
  }

  // Сериализует мутирующие операции над треком (enable / switchDevice); вытесненная операция → 'superseded'
  private runExclusive(operation: (abortController: AbortController) => Promise<SwitchOutcome>): Promise<SwitchOutcome> {
    return runExclusiveOperation(this.exclusive, operation, () => this.emitStateIfChanged())
  }

  getTrack(): MediaStreamTrack | null {
    return this.getOutputTrack()
  }

  getState(): AudioTrackState {
    // deviceId/settings — с оригинального трека; track — с выхода графа (то, что публикуется)
    return {
      track: this.getOutputTrack(),
      isEnabled: this.isEnabled,
      isMuted: this.isMuted,
      isSourceMuted: this.sourceMute.isMuted,
      isSpeaking: this.isSpeaking,
      volume: this.volume,
      deviceId: this.track?.getSettings().deviceId ?? null,
      settings: this.track?.getSettings() ?? null,
    }
  }

  // Уничтожить менеджер и освободить ресурсы
  destroy(): void {
    if (this.exclusive.abortController) {
      this.exclusive.abortController.abort()
      this.exclusive.abortController = null
    }

    this.destroyVAD()
    this.disable()
    this.pipeline.destroy()
    this.removeAllListeners()
  }

  // Запустить граф на текущем треке, если обработка включена
  private async startPipelineIfEngaged(): Promise<void> {
    if (this.pipelineEngaged && this.track) {
      await this.pipeline.start(this.track)
    }
  }

  // gUM с учётом deviceFallback; отменённая операция не оставляет живых треков
  private async openTrack(abortController?: AbortController, deviceId?: string): Promise<MediaStreamTrack> {
    const config = this.getConfig()
    const effectiveConfig = deviceId ? { ...config, deviceId } : config
    const constraints = ConstraintsBuilderService.buildAudioConstraints(effectiveConfig)

    if (abortController?.signal.aborted) {
      throw new DOMException('Operation aborted', 'AbortError')
    }

    const { stream, fallback } = await getUserMediaWithFallback('audio', constraints, effectiveConfig.deviceId, config.deviceFallback)

    if (abortController?.signal.aborted) {
      stream.getTracks().forEach((t) => t.stop())
      throw new DOMException('Operation aborted', 'AbortError')
    }

    this.fallbackFrom = fallback ? fallback.requestedDeviceId : null
    if (fallback) this.emit(AudioTrackEvents.DEVICE_FALLBACK, fallback)

    return stream.getAudioTracks()[0]
  }

  private async acquireTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const newTrack = await this.openTrack(abortController, deviceId)

    this.setTrack(newTrack)
    this.isEnabled = true
    this.isMuted = false

    this.initVAD(newTrack)
    await this.startPipelineIfEngaged()

    this.emit(AudioTrackEvents.TRACK_ADDED, { track: this.getOutputTrack()! })
  }

  private async replaceTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const oldTrack = this.track
    const oldOutputTrack = this.getOutputTrack()

    // Сначала gUM: при ошибке старый трек и граф не тронуты
    const newTrack = await this.openTrack(abortController, deviceId)

    // mute переживает смену устройства: новый трек не должен передавать звук до unmute()
    const wasMuted = this.isMuted
    newTrack.enabled = !wasMuted

    // Останавливаем VAD и граф (он привязан к старому треку) перед заменой
    this.destroyVAD()
    this.pipeline.stop()

    if (oldTrack) {
      this.detachListeners()
      oldTrack.stop()
    }

    this.setTrack(newTrack)

    // Запускаем VAD и граф для нового трека (при mute VAD не работает, как в mute())
    if (!wasMuted) this.initVAD(newTrack)
    try {
      await this.startPipelineIfEngaged()
    } catch (pipelineError) {
      // Граф не поднялся: отдаём сырой трек, но сообщаем об ошибке
      this.pipeline.stop()
      this.emit(AudioTrackEvents.ERROR, pipelineError instanceof Error ? pipelineError : new Error(String(pipelineError)))
    }

    const newOutputTrack = this.getOutputTrack()!

    if (oldOutputTrack) {
      this.emit(AudioTrackEvents.TRACK_REPLACED, { track: newOutputTrack, oldTrack: oldOutputTrack })
    } else {
      this.emit(AudioTrackEvents.TRACK_ADDED, { track: newOutputTrack })
    }
  }

  // Единая точка подписки на ended/mute/unmute сырого трека (выход графа их не получает)
  private setTrack(track: MediaStreamTrack): void {
    this.detachListeners()
    this.track = track
    this.lastDevice = describeTrackDevice(track)

    const onEnded = () => this.handleTrackEnded(track)
    const onMute = () => this.handleSourceMute(track, true)
    const onUnmute = () => this.handleSourceMute(track, false)
    track.addEventListener('ended', onEnded)
    track.addEventListener('mute', onMute)
    track.addEventListener('unmute', onUnmute)

    this.detachTrackListeners = () => {
      track.removeEventListener('ended', onEnded)
      track.removeEventListener('mute', onMute)
      track.removeEventListener('unmute', onUnmute)
    }
    if (track.muted) this.sourceMute.update(true)
  }

  private detachListeners(): void {
    this.detachTrackListeners?.()
    this.detachTrackListeners = null
    this.sourceMute.reset()
  }

  private handleSourceMute(track: MediaStreamTrack, muted: boolean): void {
    if (this.track !== track) return
    this.sourceMute.update(muted)
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

  // Микрофон отключён или трек завершился (не disable): lastDevice сохраняется
  private handleTrackEnded(track: MediaStreamTrack): void {
    if (this.track === track) {
      const removedTrack = this.getOutputTrack()!

      this.destroyVAD()
      this.pipeline.stop()
      this.detachListeners()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(AudioTrackEvents.TRACK_REMOVED, { track: removedTrack })
      this.emitStateIfChanged()
      if (this.lastDevice) this.emit(AudioTrackEvents.TRACK_ENDED, this.lastDevice)
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
      this.lastEmittedState.isSourceMuted !== currentState.isSourceMuted ||
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
