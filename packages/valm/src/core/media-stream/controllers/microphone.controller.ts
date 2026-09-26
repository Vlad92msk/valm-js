import {
  ErrorCallback,
  AudioConfiguration,
  MediaErrorEvent,
  MediaEvents,
  MicrophoneState,
  MicrophoneStateChangeCallback,
  VolumeChangeCallback,
  VolumeChangeEvent,
} from '../../types'
import { ConfigurationService } from '../../configuration'
import { MediaStreamService } from '../media-stream.service'
import { ConstraintsBuilderService } from '../constraints-builder.service'
import { AudioDataCallback } from '../audio-processing-pipeline.service'
import { DeviceFallbackEvent, DevicesState, SourceMuteChangeEvent, SwitchResult, TrackEndedEvent } from '../device.types'
import { toSwitchResult } from '../track-manager.shared'

export class MicrophoneController {
  private stateCallbacks = new Set<MicrophoneStateChangeCallback>()
  private volumeCallbacks = new Set<VolumeChangeCallback>()
  private errorCallbacks = new Set<ErrorCallback>()
  private isInternalUpdate = false
  private isSwitchingDevice = false
  private previewTrack: MediaStreamTrack | null = null
  private unsubscribes: VoidFunction[] = []

  constructor(
    private configService: ConfigurationService,
    private mediaStreamService: MediaStreamService,
  ) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.unsubscribes.push(
      this.mediaStreamService.on(MediaEvents.AUDIO_STATE_CHANGED, () => {
        this._notifyStateChange(this.state)
      }),
      this.mediaStreamService.on(MediaEvents.VOLUME_CHANGE, (data) => {
        this._notifyVolumeChange(data)
      }),
      this.mediaStreamService.on(MediaEvents.ERROR, (error, kind) => {
        if (kind === 'video') return
        this._notifyError({ source: kind ? 'microphone' : 'camera/microphone', error })
      }),
      this.configService.on('audioConfigChanged', async (event) => {
        await this.handleConfigurationChange(event)
      }),
    )
  }

  destroy(): void {
    this.stopPreview()
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.stateCallbacks.clear()
    this.volumeCallbacks.clear()
    this.errorCallbacks.clear()
  }

  private async handleConfigurationChange(event: any): Promise<void> {
    if (!this.state.isEnabled) return

    try {
      if (event.property === 'deviceId' && event.newValue !== event.oldValue && !this.isSwitchingDevice) {
        // deviceId изменился - переключаем устройство
        // Не передаем deviceId, так как он уже установлен в configService
        await this.mediaStreamService.switchAudioDevice()
      } else if (event.property === 'update' && !this.isInternalUpdate) {
        await this.restart()
      }
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'configUpdate', error })
    }
  }

  updateAudioProcessing = async (options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean }): Promise<void> => {
    this.configService.setAudioProcessing(options)
    // restart произойдёт через handleConfigurationChange по событию 'update'
  }

  updateDevice = async (deviceId: string): Promise<void> => {
    this.configService.setAudioDevice(deviceId)
  }

  updateVolumeThreshold = (threshold: number): void => {
    this.configService.updateAudioConfig({ volumeThreshold: threshold })
  }

  private async restart(): Promise<void> {
    if (this.state.isEnabled) {
      this.disable()
      await this.enable()
    }
  }

  enable = async (deviceId?: string): Promise<void> => {
    try {
      if (deviceId) {
        // Под флагом: иначе handleConfigurationChange запустит второе переключение (N8)
        this.isSwitchingDevice = true
        try {
          this.configService.setAudioDevice(deviceId)
        } finally {
          this.isSwitchingDevice = false
        }
      }

      const config = this.configService.getAudioConfig()
      const mediaState = this.mediaStreamService.getState()

      if (mediaState.hasAudio && config.deviceId && config.deviceId !== mediaState.currentAudioDevice) {
        await this.mediaStreamService.switchAudioDevice()
      } else {
        await this.mediaStreamService.enableAudio()
      }

      if (!config.enabled) {
        this.isInternalUpdate = true
        this.configService.updateAudioConfig({ enabled: true })
        this.isInternalUpdate = false
      }
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'enable', error })
      throw error
    }
  }

  getConfiguration = (): AudioConfiguration => {
    return this.configService.getAudioConfig()
  }

  disable = (): void => {
    try {
      this.mediaStreamService.disableAudio()
      this.isInternalUpdate = true
      this.configService.updateAudioConfig({ enabled: false })
      this.isInternalUpdate = false
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'disable', error })
      throw error
    }
  }

  toggleMute = async (): Promise<void> => {
    const mediaState = this.mediaStreamService.getState()

    // Если трека нет — включаем (hard enable)
    if (!mediaState.hasAudio) {
      await this.enable()
      return
    }

    // Если есть трек — просто переключаем enabled
    if (mediaState.isAudioMuted) {
      this.mediaStreamService.unmuteAudio()
    } else {
      this.mediaStreamService.muteAudio()
    }
  }

  toggle = async (): Promise<void> => {
    const mediaState = this.mediaStreamService.getState()

    // Если есть трек — выключаем полностью (hard stop)
    if (mediaState.hasAudio) {
      await this.disable()
      return
    }

    // Иначе — включаем (создаём трек и producer)
    await this.enable()
  }

  // Создать preview трек для предпросмотра (не добавляется в основной stream)
  preview = async (deviceId?: string): Promise<MediaStreamTrack> => {
    this.stopPreview()

    try {
      const config = this.configService.getAudioConfig()
      const effectiveConfig = deviceId ? { ...config, deviceId } : config
      const constraints = ConstraintsBuilderService.buildAudioConstraints(effectiveConfig)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
      this.previewTrack = stream.getAudioTracks()[0]

      this._notifyStateChange(this.state)
      return this.previewTrack
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'preview', error })
      throw error
    }
  }

  // Опубликовать preview трек в основной stream
  publishPreview = async (): Promise<void> => {
    if (!this.previewTrack) {
      throw new Error('No preview track to publish. Call preview() first.')
    }

    try {
      const track = this.previewTrack
      this.previewTrack = null

      await this.mediaStreamService.enableAudioWithTrack(track)

      this.isInternalUpdate = true
      this.configService.updateAudioConfig({ enabled: true })
      this.isInternalUpdate = false
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'publishPreview', error })
      throw error
    }
  }

  // Остановить preview без публикации
  stopPreview = (): void => {
    if (this.previewTrack) {
      this.previewTrack.stop()
      this.previewTrack = null
      this._notifyStateChange(this.state)
    }
  }

  reset = async (): Promise<void> => {
    if (this.state.isEnabled) {
      await this.disable()
    }
  }

  // Резолвится после фактической смены трека; при ошибке конфиг откатывается к прежнему устройству.
  // null — системный микрофон. force — переоткрыть даже текущее устройство (например, 'default' после смены входа в ОС)
  switchDevice = async (deviceId: string | null, options?: { force?: boolean }): Promise<SwitchResult> => {
    const prevDeviceId = this.configService.getAudioConfig().deviceId
    const force = options?.force ?? false
    try {
      this.isSwitchingDevice = true
      if (deviceId !== prevDeviceId) this.configService.setAudioDevice(deviceId)
      if (!this.state.isEnabled) return { applied: false, deviceId, reason: 'disabled' }
      // null → null без force: менеджер иначе переоткрыл бы дефолт
      if (deviceId === null && prevDeviceId === null && !force) return { applied: false, deviceId, reason: 'noop' }

      const outcome = await this.mediaStreamService.switchAudioDevice(deviceId ?? undefined, { force })
      return toSwitchResult(outcome, deviceId)
    } catch (error) {
      this.configService.setAudioDevice(prevDeviceId)
      this._notifyError({ source: 'microphone', action: 'switch', error })
      throw error
    } finally {
      this.isSwitchingDevice = false
    }
  }

  // Переоткрыть текущее устройство (config.deviceId) с сохранением mute и графа
  reacquire = (): Promise<SwitchResult> => {
    return this.switchDevice(this.configService.getAudioConfig().deviceId, { force: true })
  }

  // Вызывается Valm на devicechange: вернуться на выбранный микрофон, когда он снова появился после fallback
  _handleDevicesChanged = async (devices: DevicesState): Promise<void> => {
    const preferred = this.mediaStreamService.getFallbackFrom('audio')
    if (!preferred || !this.state.isEnabled) return
    if (!devices.microphones.some((d) => d.deviceId === preferred)) return

    try {
      await this.mediaStreamService.switchAudioDevice(preferred)
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'switch', error })
    }
  }

  // Вызывается Valm, когда ОС сменила системный вход: при followSystemDefault переоткрываем 'default'
  _handleDefaultDeviceChanged = async (): Promise<void> => {
    const config = this.configService.getAudioConfig()
    if (!config.followSystemDefault || !this.state.isEnabled) return
    if (config.deviceId && config.deviceId !== 'default') return

    await this.reacquire().catch(() => {
      // ошибка уже отправлена в onError из switchDevice
    })
  }

  // gain/визуализация через Web Audio граф; при первом использовании он включается
  // и заменяет публикуемый трек на обработанный (onTrackReplaced)

  // Множитель громкости (1.0 = без изменений)
  setGain = (value: number): void => {
    this.mediaStreamService.getAudioProcessingPipeline().setGain(value)
    void this.mediaStreamService.engageAudioProcessing().catch((error) => {
      this._notifyError({ source: 'microphone', action: 'setGain', error })
    })
  }

  getGain = (): number => {
    return this.mediaStreamService.getAudioProcessingPipeline().getGain()
  }

  // Спектр текущего кадра (пустой массив, пока граф не активен)
  getFrequencyData = (): Uint8Array => {
    return this.mediaStreamService.getAudioProcessingPipeline().getFrequencyData()
  }

  // Временная форма сигнала (пустой массив, пока граф не активен)
  getWaveformData = (): Uint8Array => {
    return this.mediaStreamService.getAudioProcessingPipeline().getWaveformData()
  }

  onAudioData = (callback: AudioDataCallback): VoidFunction => {
    void this.mediaStreamService.engageAudioProcessing().catch((error) => {
      this._notifyError({ source: 'microphone', action: 'onAudioData', error })
    })
    return this.mediaStreamService.getAudioProcessingPipeline().onAudioData(callback)
  }

  onTrackReplaced = (callback: (event: { oldTrack: MediaStreamTrack; newTrack: MediaStreamTrack; isMuted: boolean }) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.TRACK_REPLACED, (event) => {
      if (event.kind === 'audio') {
        callback({ oldTrack: event.oldTrack!, newTrack: event.track, isMuted: event.isMuted ?? false })
      }
    })
  }

  // Источник перестал/начал отдавать звук (track.muted); не путать с программным mute
  onSourceMuteChange = (callback: (event: SourceMuteChangeEvent) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.SOURCE_MUTE_CHANGED, ({ kind, muted, track }) => {
      if (kind === 'audio') callback({ muted, track })
    })
  }

  // Трек завершился не по disable(); reason 'device-lost' — микрофона больше нет в системе
  onTrackEnded = (callback: (event: TrackEndedEvent) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.TRACK_ENDED, (event) => {
      if (event.kind === 'audio') callback(event)
    })
  }

  // Выбранного микрофона нет — открыт системный (audio.deviceFallback: 'default')
  onDeviceFallback = (callback: (event: DeviceFallbackEvent) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.DEVICE_FALLBACK, ({ kind, ...event }) => {
      if (kind === 'audio') callback(event)
    })
  }

  onStateChange = (callback: MicrophoneStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onVolumeChange = (callback: VolumeChangeCallback): VoidFunction => {
    this.volumeCallbacks.add(callback)
    return () => this.volumeCallbacks.delete(callback)
  }

  onError = (callback: ErrorCallback): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private _notifyStateChange(state: MicrophoneState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyVolumeChange(data: VolumeChangeEvent): void {
    this.volumeCallbacks.forEach((callback) => callback(data))
  }

  private _notifyError(error: MediaErrorEvent): void {
    if (error.source === 'microphone' || error.source === 'camera/microphone') {
      this.errorCallbacks.forEach((callback) => callback(error))
    }
  }

  getStream(): MediaStream | null {
    return this.mediaStreamService.getStream()
  }

  getTrack(): MediaStreamTrack | null {
    const stream = this.getStream()
    return stream?.getAudioTracks()[0] || null
  }

  get state(): MicrophoneState {
    const mediaState = this.mediaStreamService.getState()
    return {
      isEnabled: mediaState.isAudioEnabled,
      isMuted: mediaState.isAudioMuted,
      isPreviewing: this.previewTrack !== null,
      hasDevice: mediaState.hasAudio,
      deviceId: mediaState.currentAudioDevice,
      settings: mediaState.audioSettings,
      volume: mediaState.volume,
      isSpeaking: mediaState.isSpeaking,
      isSourceMuted: mediaState.isAudioSourceMuted,
    }
  }
}
