import { VideoConfiguration } from '../configuration/configuration.types'
import { DeviceDetector } from '../utils'
import { TypedEventEmitter } from '../utils'
import { ConstraintsBuilderService } from './constraints-builder.service'
import { getUserMediaWithFallback } from './device-fallback.helper'
import { DeviceFallbackEvent } from './device.types'
import { ExclusiveState, SwitchOutcome, TrackDeviceInfo, describeTrackDevice, runExclusiveOperation, SourceMuteReporter } from './track-manager.shared'
import type { IVideoProcessingPipeline } from '../../effects'

export enum VideoTrackEvents {
  TRACK_ADDED = 'trackAdded',
  TRACK_REMOVED = 'trackRemoved',
  TRACK_REPLACED = 'trackReplaced',
  TRACK_MUTED = 'trackMuted',
  TRACK_UNMUTED = 'trackUnmuted',
  STATE_CHANGED = 'stateChanged',
  SOURCE_MUTE_CHANGED = 'sourceMuteChanged',
  TRACK_ENDED = 'trackEnded',
  DEVICE_FALLBACK = 'deviceFallback',
  ERROR = 'error',
}

export interface VideoTrackState {
  track: MediaStreamTrack | null
  isEnabled: boolean
  isMuted: boolean
  isSourceMuted: boolean
  deviceId: string | null
  settings: MediaTrackSettings | null
}

export interface VideoTrackEventPayload {
  track: MediaStreamTrack
  oldTrack?: MediaStreamTrack
  // Причина замены трека (только для TRACK_REPLACED):
  //  'device'     — сменилось физическое устройство (switchDevice / replaceTrack)
  //  'background' — трек подменил пайплайн эффектов (suspend/resume)
  source?: 'device' | 'background'
}

interface VideoTrackEventMap {
  [VideoTrackEvents.TRACK_ADDED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_REMOVED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_REPLACED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_MUTED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.TRACK_UNMUTED]: (payload: VideoTrackEventPayload) => void
  [VideoTrackEvents.STATE_CHANGED]: (state: VideoTrackState) => void
  [VideoTrackEvents.SOURCE_MUTE_CHANGED]: (payload: { muted: boolean; track: MediaStreamTrack }) => void
  [VideoTrackEvents.TRACK_ENDED]: (device: TrackDeviceInfo) => void
  [VideoTrackEvents.DEVICE_FALLBACK]: (event: DeviceFallbackEvent) => void
  [VideoTrackEvents.ERROR]: (error: Error) => void
}


export class VideoTrackManagerService extends TypedEventEmitter<VideoTrackEventMap> {
  private track: MediaStreamTrack | null = null
  private pipeline: IVideoProcessingPipeline | null = null
  private isEnabled = false
  private isMuted = false

  private exclusive: ExclusiveState = { pending: null, abortController: null }

  private isResuming = false
  private suspendAfterResume = false

  private detachTrackListeners: VoidFunction | null = null
  private sourceMute = new SourceMuteReporter(
    () => this.getConfig().sourceMuteDebounceMs ?? 0,
    (muted) => {
      const track = this.getOutputTrack()
      if (track) this.emit(VideoTrackEvents.SOURCE_MUTE_CHANGED, { muted, track })
      this.emitStateIfChanged()
    },
  )
  // Последнее открытое устройство; переживает 'ended', сбрасывается в disable()
  private lastDevice: TrackDeviceInfo | null = null
  // Запрошенный deviceId, вместо которого открыта системная камера (deviceFallback: 'default')
  private fallbackFrom: string | null = null

  private lastEmittedState: VideoTrackState | null = null

  constructor(private getConfig: () => VideoConfiguration) {
    super()
    // Pipeline не создаётся по умолчанию — устанавливается через setPipeline()
    // при подключении EffectsPlugin
  }

  // Включить видео (получить трек с камеры)
  async enable(): Promise<MediaStreamTrack | null> {
    try {
      await this.runExclusive(async (abortController) => {
        if (this.track) {
          // Трек уже есть — просто включаем
          this.setMutedTracks(false)
          this.isMuted = false
          this.emit(VideoTrackEvents.TRACK_UNMUTED, { track: this.getOutputTrack()! })
        } else {
          // Создаём новый трек
          await this.acquireTrack(abortController)
        }

        this.isEnabled = true
        return 'replaced'
      })

      return this.getOutputTrack()
    } catch (error) {
      this.handleError('Failed to enable video', error)
      return null
    }
  }

  // Включить видео с уже существующим треком (preview → publish)
  async enableWithTrack(externalTrack: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    try {
      // Отменяем in-flight acquire/switch, иначе он позже перезапишет externalTrack
      this.exclusive.abortController?.abort()

      if (this.track) {
        this.disable()
      }

      this.setTrack(externalTrack)
      this.fallbackFrom = null
      this.isEnabled = true
      this.isMuted = false

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
    // Отменяем in-flight acquire/switch, чтобы он не «воскресил» трек после выключения
    this.exclusive.abortController?.abort()
    this.lastDevice = null

    if (this.track) {
      const removedTrack = this.getOutputTrack()! // ← возвращаем обработанный

      // Останавливаем pipeline
      if (this.pipeline?.isRunning()) {
        this.pipeline.stop()
      }

      this.detachListeners()
      this.track.stop()
      this.track = null
      this.isEnabled = false
      this.isMuted = false

      this.emit(VideoTrackEvents.TRACK_REMOVED, { track: removedTrack })
      this.emitStateIfChanged()
    }
  }

  // Заглушить видео (трек остаётся, но не передаёт данные).
  // Глушим и сырой, и выходной трек, чтобы mute пережил suspend/resume pipeline
  mute(): void {
    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      this.setMutedTracks(true)
      this.isMuted = true
      this.emit(VideoTrackEvents.TRACK_MUTED, { track: outputTrack })
      this.emitStateIfChanged()
    }
  }

  // Снять приглушение видео
  unmute(): void {
    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      this.setMutedTracks(false)
      this.isMuted = false
      this.emit(VideoTrackEvents.TRACK_UNMUTED, { track: outputTrack })
      this.emitStateIfChanged()
    }
  }

  private setMutedTracks(muted: boolean): void {
    if (this.track) this.track.enabled = !muted
    const output = this.getOutputTrack()
    if (output) output.enabled = !muted
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

  getLastDevice(): TrackDeviceInfo | null {
    return this.lastDevice
  }

  getFallbackFrom(): string | null {
    return this.fallbackFrom
  }

  removePipeline(): void {
    if (this.pipeline) {
      this.pipeline.stop()
      this.pipeline = null
    }
  }

  // Приостановить pipeline и переключиться на оригинальный трек
  suspendPipeline(): void {
    // Если pipeline ещё стартует (resumePipeline в процессе) —
    // планируем suspend после завершения start()
    if (this.isResuming) {
      this.suspendAfterResume = true
      return
    }

    if (!this.pipeline?.isRunning() || !this.track) return

    const oldOutputTrack = this.getOutputTrack()
    this.pipeline.stop()
    const newOutputTrack = this.getOutputTrack() // вернёт this.track

    if (oldOutputTrack && newOutputTrack && oldOutputTrack !== newOutputTrack) {
      if (this.isMuted) newOutputTrack.enabled = false
      this.emit(VideoTrackEvents.TRACK_REPLACED, {
        track: newOutputTrack,
        oldTrack: oldOutputTrack,
        source: 'background',
      })
    }
  }

  // Возобновить pipeline (при включении эффекта)
  async resumePipeline(): Promise<void> {
    if (!this.pipeline || this.pipeline.isRunning() || !this.track) return

    this.isResuming = true
    this.suspendAfterResume = false

    const oldOutputTrack = this.getOutputTrack()

    try {
      await this.pipeline.start(this.track)
    } finally {
      this.isResuming = false
    }

    const newOutputTrack = this.getOutputTrack()

    if (oldOutputTrack && newOutputTrack && oldOutputTrack !== newOutputTrack) {
      // Выходной трек pipeline создаётся с enabled=true — возвращаем mute
      if (this.isMuted) newOutputTrack.enabled = false
      this.emit(VideoTrackEvents.TRACK_REPLACED, {
        track: newOutputTrack,
        oldTrack: oldOutputTrack,
        source: 'background',
      })
    }

    // Если suspendPipeline() вызвали пока start() был в процессе — выполняем сейчас
    if (this.suspendAfterResume) {
      this.suspendAfterResume = false
      this.suspendPipeline()
    }
  }

  // Возвращает обработанный трек если pipeline активен, иначе оригинальный
  getOutputTrack(): MediaStreamTrack | null {
    if (this.pipeline?.isRunning()) {
      return this.pipeline.getOutputTrack()
    }
    return this.track
  }

  // Переключить камеру на другое устройство; force — переоткрыть даже тот же deviceId
  async switchDevice(deviceId?: string, options?: { force?: boolean }): Promise<SwitchOutcome> {
    return this.runExclusive(async (abortController) => {
      // Проверяем нужно ли переключать
      const currentDeviceId = this.track?.getSettings().deviceId
      const targetDeviceId = deviceId ?? this.getConfig().deviceId

      if (!options?.force && currentDeviceId && targetDeviceId && currentDeviceId === targetDeviceId && this.isTrackActive()) {
        return 'noop'
      }

      if (this.isTrackActive()) {
        if (DeviceDetector.isMobile()) {
          // На мобильных устройствах останавливаем старый трек ДО getUserMedia —
          // многие устройства не поддерживают два активных camera-трека одновременно
          await this.replaceTrackMobile(abortController, deviceId)
        } else {
          await this.replaceTrack(abortController, deviceId)
        }
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

  getState(): VideoTrackState {
    const outputTrack = this.getOutputTrack()
    return {
      track: outputTrack,
      isEnabled: this.isEnabled,
      isMuted: this.isMuted,
      isSourceMuted: this.sourceMute.isMuted,
      deviceId: this.track?.getSettings().deviceId ?? null,
      settings: outputTrack?.getSettings() ?? null,
    }
  }

  // Уничтожить менеджер и освободить ресурсы
  destroy(): void {
    if (this.exclusive.abortController) {
      this.exclusive.abortController.abort()
      this.exclusive.abortController = null
    }

    this.removePipeline()
    this.disable()
    this.removeAllListeners()
  }

  // gUM с учётом deviceFallback; отменённая операция не оставляет живых треков
  private async openTrack(abortController?: AbortController, deviceId?: string): Promise<MediaStreamTrack> {
    const config = this.getConfig()
    const effectiveConfig = deviceId ? { ...config, deviceId } : config
    const constraints = ConstraintsBuilderService.buildVideoConstraints(effectiveConfig)

    if (abortController?.signal.aborted) {
      throw new DOMException('Operation aborted', 'AbortError')
    }

    const { stream, fallback } = await getUserMediaWithFallback('video', constraints, effectiveConfig.deviceId, config.deviceFallback)

    if (abortController?.signal.aborted) {
      stream.getTracks().forEach((t) => t.stop())
      throw new DOMException('Operation aborted', 'AbortError')
    }

    this.fallbackFrom = fallback ? fallback.requestedDeviceId : null
    if (fallback) this.emit(VideoTrackEvents.DEVICE_FALLBACK, fallback)

    return stream.getVideoTracks()[0]
  }

  private async acquireTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const newTrack = await this.openTrack(abortController, deviceId)
    this.setTrack(newTrack)
    this.isEnabled = true
    this.isMuted = false

    await this.startPipelineSafe(newTrack)

    const outputTrack = this.getOutputTrack()
    if (outputTrack) {
      this.emit(VideoTrackEvents.TRACK_ADDED, { track: outputTrack })
    }
  }

  private async replaceTrack(abortController?: AbortController, deviceId?: string): Promise<void> {
    const oldTrack = this.track
    const oldOutputTrack = this.getOutputTrack()

    // Сначала getUserMedia: при ошибке pipeline и выходной трек остаются нетронутыми
    const newTrack = await this.openTrack(abortController, deviceId)

    const seamless = await this.switchPipelineInput(newTrack)

    // Пока pipeline менял вход, камеру могли выключить
    if (!seamless && abortController?.signal.aborted) {
      newTrack.stop()
      throw new DOMException('Operation aborted', 'AbortError')
    }

    if (!seamless && this.pipeline?.isRunning()) {
      this.pipeline.stop()
    }

    if (oldTrack) {
      this.detachListeners()
      oldTrack.stop()
    }

    if (seamless) {
      this.setRawTrack(newTrack)
    } else {
      await this.installNewTrack(newTrack, oldOutputTrack)
    }
  }

  // Мобильные: камера одна, поэтому старый трек останавливается до getUserMedia.
  // При ошибке пробуем вернуть прежнее устройство, иначе честно выключаемся
  private async replaceTrackMobile(abortController?: AbortController, deviceId?: string): Promise<void> {
    const oldOutputTrack = this.getOutputTrack()
    const prevDeviceId = this.lastDevice?.deviceId ?? undefined

    // Pipeline не останавливаем: если камера откроется, сменим только его вход
    if (this.track) {
      this.detachListeners()
      this.track.stop()
      this.track = null
    }

    // iOS требует небольшую паузу после stop()
    await new Promise((res) => setTimeout(res, 100))

    let newTrack: MediaStreamTrack
    try {
      newTrack = await this.openTrack(abortController, deviceId)
    } catch (error) {
      const restored =
        prevDeviceId && prevDeviceId !== deviceId && !abortController?.signal.aborted
          ? await this.openTrack(undefined, prevDeviceId).catch(() => null)
          : null

      if (restored) {
        await this.installAfterStop(restored, oldOutputTrack)
      } else {
        if (this.pipeline?.isRunning()) this.pipeline.stop()
        this.isEnabled = false
        this.isMuted = false
        if (oldOutputTrack) this.emit(VideoTrackEvents.TRACK_REMOVED, { track: oldOutputTrack })
        this.emitStateIfChanged()
      }
      throw error
    }

    await this.installAfterStop(newTrack, oldOutputTrack)
  }

  // Старый сырой трек уже остановлен: меняем вход работающего pipeline, иначе перезапускаем его
  private async installAfterStop(newTrack: MediaStreamTrack, oldOutputTrack: MediaStreamTrack | null): Promise<void> {
    if (await this.switchPipelineInput(newTrack)) {
      this.setRawTrack(newTrack)
      return
    }
    if (this.pipeline?.isRunning()) this.pipeline.stop()
    await this.installNewTrack(newTrack, oldOutputTrack)
  }

  // Бесшовная смена камеры: выходной трек pipeline остаётся тем же, поэтому TRACK_REPLACED не нужен.
  // false — pipeline не запущен, не умеет менять вход или не смог: нужен обычный перезапуск
  private async switchPipelineInput(newTrack: MediaStreamTrack): Promise<boolean> {
    const pipeline = this.pipeline
    if (!pipeline?.isRunning() || !pipeline.switchInput) return false
    try {
      await pipeline.switchInput(newTrack)
      return true
    } catch {
      return false
    }
  }

  // Новый сырой трек с сохранением mute
  private setRawTrack(newTrack: MediaStreamTrack): void {
    const wasMuted = this.isMuted
    this.setTrack(newTrack)
    newTrack.enabled = !wasMuted
  }

  // Поставить новый сырой трек, поднять pipeline, сохранить mute и сообщить о замене
  private async installNewTrack(newTrack: MediaStreamTrack, oldOutputTrack: MediaStreamTrack | null): Promise<void> {
    const wasMuted = this.isMuted
    this.setRawTrack(newTrack)

    await this.startPipelineSafe(newTrack)

    const newOutputTrack = this.getOutputTrack()
    if (!newOutputTrack) return
    if (wasMuted) newOutputTrack.enabled = false

    if (oldOutputTrack) {
      this.emit(VideoTrackEvents.TRACK_REPLACED, {
        track: newOutputTrack,
        oldTrack: oldOutputTrack,
        source: 'device',
      })
    } else {
      this.emit(VideoTrackEvents.TRACK_ADDED, { track: newOutputTrack })
    }
  }

  // Ошибка pipeline не должна оставлять потребителя на мёртвом треке: отдаём сырой трек + ERROR
  private async startPipelineSafe(track: MediaStreamTrack): Promise<void> {
    try {
      await this.pipeline?.start(track)
    } catch (error) {
      if (this.pipeline?.isRunning()) this.pipeline.stop()
      this.emit(VideoTrackEvents.ERROR, error instanceof Error ? error : new Error(String(error)))
    }
  }

  // Единая точка подписки на ended/mute/unmute сырого трека (выход pipeline их не получает)
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

  // Камера отключена или трек завершился (не disable): lastDevice сохраняется
  private handleTrackEnded(endedTrack: MediaStreamTrack): void {
    // Если трек уже не актуальный — игнорируем
    if (this.track !== endedTrack) return

    this.detachListeners()

    // Запоминаем output трек ДО остановки pipeline —
    // приложение держит именно его, а не raw трек камеры
    const outputTrack = this.getOutputTrack()

    // Останавливаем pipeline — source мёртв, нет смысла крутить rAF loop
    if (this.pipeline?.isRunning()) {
      this.pipeline.stop()
    }

    this.track = null
    this.isEnabled = false
    this.isMuted = false

    if (outputTrack) {
      this.emit(VideoTrackEvents.TRACK_REMOVED, { track: outputTrack })
    }
    this.emitStateIfChanged()
    if (this.lastDevice) this.emit(VideoTrackEvents.TRACK_ENDED, this.lastDevice)
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
      isSourceMuted: this.sourceMute.isMuted,
      deviceId: settings?.deviceId ?? null,
      settings,
    }

    // сравниваем только то, что реально важно
    const changed =
      !this.lastEmittedState ||
      this.lastEmittedState.isEnabled !== currentState.isEnabled ||
      this.lastEmittedState.isMuted !== currentState.isMuted ||
      this.lastEmittedState.isSourceMuted !== currentState.isSourceMuted ||
      this.lastEmittedState.deviceId !== currentState.deviceId ||
      this.lastEmittedState.track !== currentState.track

    if (changed) {
      this.lastEmittedState = currentState
      this.emit(VideoTrackEvents.STATE_CHANGED, currentState)
    }
  }

  private handleError(message: string, error: unknown): void {
    const finalError = error instanceof Error ? error : new Error(message)
    this.emit(VideoTrackEvents.ERROR, finalError)
    throw finalError
  }
}
