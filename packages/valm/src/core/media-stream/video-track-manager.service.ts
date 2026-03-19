import { VideoConfiguration } from '../configuration/configuration.types'
import { isIOS } from '../utils/ios-media.helper'
import { TypedEventEmitter } from '../utils/typed-event-emitter'
import { ConstraintsBuilderService } from './constraints-builder.service'
import { IVideoProcessingPipeline } from '../../effects/types'

export enum VideoTrackEvents {
  TRACK_ADDED = 'trackAdded',
  TRACK_REMOVED = 'trackRemoved',
  TRACK_REPLACED = 'trackReplaced',
  TRACK_MUTED = 'trackMuted',
  TRACK_UNMUTED = 'trackUnmuted',
  STATE_CHANGED = 'stateChanged',
  ERROR = 'error',
}

export interface VideoTrackState {
  track: MediaStreamTrack | null
  isEnabled: boolean
  isMuted: boolean
  deviceId: string | null
  settings: MediaTrackSettings | null
}

export interface VideoTrackEventPayload {
  track: MediaStreamTrack
  oldTrack?: MediaStreamTrack
}

interface VideoTrackEventMap {
  [VideoTrackEvents.TRACK_ADDED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_REMOVED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_REPLACED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_MUTED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_UNMUTED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.STATE_CHANGED]: (state: VideoTrackState) => void
  [VideoTrackEvents.ERROR]: (error: Error) => void
}

export class VideoTrackManagerService extends TypedEventEmitter<VideoTrackEventMap> {
  private track: MediaStreamTrack | null = null
  private pipeline: IVideoProcessingPipeline | null = null
  private isEnabled = false
  private isMuted = false

  private pendingSwitch: Promise<void> | null = null
  private abortController: AbortController | null = null

  private lastEmittedState: VideoTrackState | null = null

  constructor(private getConfig: () => VideoConfiguration) {
    super()
    // Pipeline не создаётся по умолчанию — устанавливается через setPipeline()
    // при подключении EffectsPlugin
  }

  // Включить видео (получить трек с камеры)
  async enable(): Promise<MediaStreamTrack | null> {
    try {
      if (this.track) {
        // Трек уже есть — просто включаем
        this.track.enabled = true
        this.isMuted = false
        this.emit(VideoTrackEvents.TRACK_UNMUTED, { track: this.getOutputTrack() })
      } else {
        // Создаём новый трек
        await this.acquireTrack()
      }

      this.isEnabled = true
      this.emitStateIfChanged()

      return this.getOutputTrack()
    } catch (error) {
      this.handleError('Failed to enable video', error)
      return null
    }
  }

  // Включить видео с уже существующим треком (preview → publish)
  async enableWithTrack(externalTrack: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    try {
      if (this.track) {
        this.disable()
      }

      this.track = externalTrack
      this.isEnabled = true
      this.isMuted = false

      externalTrack.addEventListener('ended', this.handleTrackEnded)

      await this.pipeline?.start(externalTrack)

      const outputTrack = this.getOutputTrack()
      if (outputTrack) {
        this.emit(VideoTrackEvents.TRACK_ADDED, { track: outputTrack })
      }

      this.emitStateIfChanged()
      return this.getOutputTrack()
    } catch (error) {
      this.handleError('Failed to enable video with track', error)
      return null
    }
  }

  // Выключить видео и освободить трек
  disable(): void {
    if (this.track) {
      const removedTrack = this.getOutputTrack() // ← возвращаем обработанный

      // Останавливаем pipeline
      if (this.pipeline?.isRunning()) {
        this.pipeline.stop()
      }

      this.track.stop()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(VideoTrackEvents.TRACK_REMOVED, { track: removedTrack })
      this.emitStateIfChanged()
    }
  }

  // Заглушить видео (трек остаётся, но не передаёт данные)
  mute(): void {
    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      outputTrack.enabled = false
      this.isMuted = true
      this.emit(VideoTrackEvents.TRACK_MUTED, { track: outputTrack })
      this.emitStateIfChanged()
    }
  }

  // Снять приглушение видео
  unmute(): void {
    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      outputTrack.enabled = true
      this.isMuted = false
      this.emit(VideoTrackEvents.TRACK_UNMUTED, { track: outputTrack })
      this.emitStateIfChanged()
    }
  }

  // Установить pipeline обработки видео (вызывается из EffectsPlugin)
  async setPipeline(pipeline: IVideoProcessingPipeline): Promise<void> {
    this.pipeline = pipeline

    // Если трек уже есть — запускаем pipeline
    if (this.track && !pipeline.isRunning()) {
      await pipeline.start(this.track)
    }
  }

  getPipeline(): IVideoProcessingPipeline | null {
    return this.pipeline
  }

  // Получить оригинальный трек (без обработки pipeline)
  getRawTrack(): MediaStreamTrack | null {
    return this.track
  }

  removePipeline(): void {
    if (this.pipeline) {
      this.pipeline.stop()
      this.pipeline = null
    }
  }

  // Возвращает обработанный трек если pipeline активен, иначе оригинальный
  getOutputTrack(): MediaStreamTrack | null {
    if (this.pipeline?.isRunning()) {
      return this.pipeline.getOutputTrack()
    }
    return this.track
  }
  // Переключить камеру на другое устройство
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
      if (isIOS()) {
        await this.replaceTrackIOS(currentAbortController, deviceId)
      } else if (this.isTrackActive()) {
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
    return this.getOutputTrack()
  }

  getState(): VideoTrackState {
    const outputTrack = this.getOutputTrack()
    return {
      track: outputTrack,
      isEnabled: this.isEnabled,
      isMuted: this.isMuted,
      deviceId: this.track?.getSettings().deviceId ?? null,
      settings: outputTrack?.getSettings() ?? null,
    }
  }

  // Уничтожить менеджер и освободить ресурсы
  destroy(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.removePipeline()
    this.disable()
    this.removeAllListeners()
  }

  // Получить новый трек; stopOldTrackBefore=true для iOS (stop старого до getUserMedia)
  private async getNewTrack(abortController?: AbortController, deviceId?: string, stopOldTrackBefore: boolean = false): Promise<MediaStreamTrack> {
    const oldTrack = stopOldTrackBefore ? this.track : null

    if (stopOldTrackBefore && oldTrack) {
      oldTrack.removeEventListener('ended', this.handleTrackEnded)
      oldTrack.stop()
      this.track = null
      this.emit(VideoTrackEvents.TRACK_REMOVED, { track: oldTrack })

      // iOS требует небольшую паузу после stop()
      await new Promise((res) => setTimeout(res, 100))
    }

    const config = this.getConfig()
    const effectiveConfig = deviceId ? { ...config, deviceId } : config
    const constraints = ConstraintsBuilderService.buildVideoConstraints(effectiveConfig)

    if (abortController?.signal.aborted) {
      throw new DOMException('Operation aborted', 'AbortError')
    }

    const tempStream = await navigator.mediaDevices.getUserMedia({ video: constraints })

    if (abortController?.signal.aborted) {
      tempStream.getTracks().forEach((t) => t.stop())
      throw new DOMException('Operation aborted', 'AbortError')
    }

    const newTrack = tempStream.getVideoTracks()[0]
    newTrack.addEventListener('ended', this.handleTrackEnded)

    return newTrack
  }

  private async acquireTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const newTrack = await this.getNewTrack(abortController, deviceId, false)
    this.track = newTrack
    this.isEnabled = true
    this.isMuted = false

    // Запускаем pipeline с новым треком
    await this.pipeline?.start(newTrack)

    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      this.emit(VideoTrackEvents.TRACK_ADDED, { track: outputTrack })
    }
  }

  private async replaceTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const oldTrack = this.track
    const oldOutputTrack = this.getOutputTrack()
    const wasMuted = this.isMuted

    // Останавливаем pipeline
    if (this.pipeline?.isRunning()) {
      this.pipeline.stop()
    }

    const newTrack = await this.getNewTrack(abortController, deviceId, false)

    if (oldTrack) {
      oldTrack.removeEventListener('ended', this.handleTrackEnded)
      oldTrack.stop()
    }

    this.track = newTrack
    this.isMuted = wasMuted

    // Запускаем pipeline с новым треком
    await this.pipeline?.start(newTrack)

    const newOutputTrack = this.getOutputTrack()
    if (newOutputTrack) {
      if (wasMuted) newOutputTrack.enabled = false

      if (oldOutputTrack) {
        this.emit(VideoTrackEvents.TRACK_REPLACED, {
          track: newOutputTrack,
          oldTrack: oldOutputTrack,
        })
      } else {
        this.emit(VideoTrackEvents.TRACK_ADDED, { track: newOutputTrack })
      }
    }
  }

  // iOS: stop старого трека до получения нового (ограничение Safari)
  private async replaceTrackIOS(abortController?: AbortController, deviceId?: string): Promise<void> {
    const oldOutputTrack = this.getOutputTrack()
    const wasMuted = this.isMuted

    // Останавливаем pipeline
    if (this.pipeline?.isRunning()) {
      this.pipeline.stop()
    }

    const newTrack = await this.getNewTrack(abortController, deviceId, true)

    this.track = newTrack
    this.isMuted = wasMuted

    // Запускаем pipeline с новым треком
    await this.pipeline?.start(newTrack)

    const newOutputTrack = this.getOutputTrack()
    if (newOutputTrack) {
      if (wasMuted) newOutputTrack.enabled = false

      if (oldOutputTrack) {
        this.emit(VideoTrackEvents.TRACK_REPLACED, {
          track: newOutputTrack,
          oldTrack: oldOutputTrack,
        })
      } else {
        this.emit(VideoTrackEvents.TRACK_ADDED, { track: newOutputTrack })
      }
    }
  }

  // Камера отключена или трек завершился
  private handleTrackEnded = (ev: Event): void => {
    const endedTrack = ev.target as MediaStreamTrack | null
    if (!endedTrack) return

    // Если трек уже не актуальный — игнорируем
    if (this.track !== endedTrack) {
      return
    }

    // Снимаем слушатель
    endedTrack.removeEventListener('ended', this.handleTrackEnded)

    this.track = null
    this.isEnabled = false
    this.isMuted = false

    this.emit(VideoTrackEvents.TRACK_REMOVED, { track: endedTrack })
    this.emitStateIfChanged()
  }

  private isTrackActive(): boolean {
    return this.track !== null && this.track.readyState === 'live'
  }

  private emitStateIfChanged(): void {
    const track = this.track
    const settings = track ? track.getSettings() : null

    const currentState: VideoTrackState = {
      track,
      isEnabled: this.isEnabled,
      isMuted: this.isMuted,
      deviceId: settings?.deviceId ?? null,
      settings,
    }

    // сравниваем только то, что реально важно
    const changed =
      !this.lastEmittedState ||
      this.lastEmittedState.isEnabled !== currentState.isEnabled ||
      this.lastEmittedState.isMuted !== currentState.isMuted ||
      this.lastEmittedState.deviceId !== currentState.deviceId ||
      this.lastEmittedState.track !== currentState.track

    if (changed) {
      this.lastEmittedState = {
        ...currentState,
        // важно: сохраняем конкретные settings,
        // но не используем их для "глубоких" сравнений
      }
      this.emit(VideoTrackEvents.STATE_CHANGED, currentState)
    }
  }

  private handleError(message: string, error: unknown): void {
    const finalError = error instanceof Error ? error : new Error(message)
    this.emit(VideoTrackEvents.ERROR, finalError)
    throw finalError
  }
}
