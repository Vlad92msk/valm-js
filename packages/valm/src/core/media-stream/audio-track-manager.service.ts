import { AudioConfiguration } from '../configuration/configuration.types'
import { TypedEventEmitter } from '../utils'
import { VoiceActivityDetector, VoiceActivityDetectorFactory } from '../utils'
import { AudioProcessingPipelineService } from './audio-processing-pipeline.service'
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

  // Аудио-граф (gain/визуализация/ML); простаивает, пока не включён через engageProcessing
  private pipeline = new AudioProcessingPipelineService()
  private pipelineEngaged = false

  private pendingSwitch: Promise<void> | null = null
  private abortController: AbortController | null = null

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
      this.abortController?.abort()

      if (this.track) {
        this.disable()
      }

      this.track = track
      this.isEnabled = true
      this.isMuted = false

      track.addEventListener('ended', () => this.handleTrackEnded(track))

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
    this.abortController?.abort()

    if (this.track) {
      const removedTrack = this.getOutputTrack()!

      this.destroyVAD()
      this.pipeline.stop()
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

  // Переключить микрофон на другое устройство
  async switchDevice(deviceId?: string): Promise<void> {
    await this.runExclusive(async (abortController) => {
      // Проверяем нужно ли переключать
      const currentDeviceId = this.track?.getSettings().deviceId
      const targetDeviceId = deviceId ?? this.getConfig().deviceId

      if (currentDeviceId && targetDeviceId && currentDeviceId === targetDeviceId && this.isTrackActive()) {
        return
      }

      if (this.isTrackActive()) {
        await this.replaceTrack(abortController, deviceId)
      } else if (this.isEnabled) {
        await this.acquireTrack(abortController, deviceId)
      }
    })
  }

  // Сериализует мутирующие операции над треком (enable / switchDevice): отменяет
  // предыдущую in-flight операцию и ждёт её завершения, затем выполняет свою под
  // собственным AbortController. Отменённые операции (AbortError) завершаются тихо —
  // без ERROR-события и без осевших живых треков.
  private async runExclusive(operation: (abortController: AbortController) => Promise<void>): Promise<void> {
    // Захватываем предыдущую операцию и отменяем её — синхронно, чтобы конкурентные
    // вызовы выстроились в корректную цепочку (каждый отменяет ровно предшественника)
    const previous = this.pendingSwitch
    this.abortController?.abort()

    const currentAbortController = new AbortController()
    this.abortController = currentAbortController

    const operationPromise = (async () => {
      // Ждём завершения предыдущей операции (её ошибку обрабатывает её собственный вызов)
      if (previous) {
        await previous.catch(() => {})
      }

      try {
        await operation(currentAbortController)
      } catch (error) {
        // Отменённую операцию не считаем ошибкой — её вытеснила более новая
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        throw error
      } finally {
        if (this.abortController === currentAbortController) {
          this.abortController = null
        }
      }

      this.emitStateIfChanged()
    })()

    this.pendingSwitch = operationPromise

    try {
      await operationPromise
    } finally {
      if (this.pendingSwitch === operationPromise) {
        this.pendingSwitch = null
      }
    }
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
    this.pipeline.destroy()
    this.removeAllListeners()
  }

  // Запустить граф на текущем треке, если обработка включена
  private async startPipelineIfEngaged(): Promise<void> {
    if (this.pipelineEngaged && this.track) {
      await this.pipeline.start(this.track)
    }
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
      await this.startPipelineIfEngaged()

      this.emit(AudioTrackEvents.TRACK_ADDED, { track: this.getOutputTrack()! })
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
      const oldOutputTrack = this.getOutputTrack()
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

      // Останавливаем VAD и граф (он привязан к старому треку) перед заменой
      this.destroyVAD()
      this.pipeline.stop()

      if (oldTrack) {
        oldTrack.stop()
      }

      this.track = newTrack
      newTrack.addEventListener('ended', () => this.handleTrackEnded(newTrack))

      // Запускаем VAD и граф для нового трека
      this.initVAD(newTrack)
      await this.startPipelineIfEngaged()

      const newOutputTrack = this.getOutputTrack()!

      if (oldOutputTrack) {
        this.emit(AudioTrackEvents.TRACK_REPLACED, { track: newOutputTrack, oldTrack: oldOutputTrack })
      } else {
        this.emit(AudioTrackEvents.TRACK_ADDED, { track: newOutputTrack })
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
      const removedTrack = this.getOutputTrack()!

      this.destroyVAD()
      this.pipeline.stop()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(AudioTrackEvents.TRACK_REMOVED, { track: removedTrack })
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
