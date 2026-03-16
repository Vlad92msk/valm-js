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
import { ConfigurationService } from '../../configuration/configuration.service'
import { MediaStreamService } from '../media-stream.service'
import { ConstraintsBuilderService } from '../constraints-builder.service'

export class MicrophoneController {
  private stateCallbacks = new Set<MicrophoneStateChangeCallback>()
  private volumeCallbacks = new Set<VolumeChangeCallback>()
  private errorCallbacks = new Set<ErrorCallback>()
  private isInternalUpdate = false
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
      this.mediaStreamService.on(MediaEvents.ERROR, (error) => {
        this._notifyError({ source: 'camera/microphone', error })
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
      if (event.property === 'deviceId' && event.newValue !== event.oldValue) {
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

  // Configuration methods
  updateAudioProcessing = async (options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean }): Promise<void> => {
    this.configService.setAudioProcessing(options)
    // restart will be triggered by handleConfigurationChange via 'update' event
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

  // Enhanced enable method
  enable = async (deviceId?: string): Promise<void> => {
    try {
      if (deviceId) {
        this.configService.setAudioDevice(deviceId)
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

  /**
   * Создать preview трек для предпросмотра микрофона (настройки, тест уровня)
   * Трек НЕ добавляется в основной stream
   */
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

  /**
   * Опубликовать preview трек в основной stream
   * После вызова preview трек становится основным треком микрофона
   */
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

  /**
   * Остановить preview трек без публикации
   */
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

  switchDevice = async (deviceId: string): Promise<void> => {
    try {
      this.configService.setAudioDevice(deviceId)
    } catch (error) {
      this._notifyError({ source: 'microphone', action: 'switch', error })
      throw error
    }
  }

  onTrackReplaced = (callback: (event: { oldTrack: MediaStreamTrack; newTrack: MediaStreamTrack }) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.TRACK_REPLACED, (event) => {
      if (event.kind === 'audio') {
        callback({ oldTrack: event.oldTrack!, newTrack: event.track })
      }
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
    }
  }
}
