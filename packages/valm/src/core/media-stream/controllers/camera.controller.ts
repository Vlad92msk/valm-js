import { CameraState, CameraStateChangeCallback, ErrorCallback, VideoConfiguration, MediaErrorEvent, MediaEvents } from '../../types'
import { ConstraintsBuilderService } from '../constraints-builder.service'
import { ConfigurationService } from '../../configuration/configuration.service'
import { MediaStreamService } from '../media-stream.service'

export class CameraController {
  private stateCallbacks = new Set<CameraStateChangeCallback>()
  private errorCallbacks = new Set<ErrorCallback>()
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
      this.mediaStreamService.on(MediaEvents.VIDEO_STATE_CHANGED, () => {
        this._notifyStateChange(this.state)
      }),
      this.mediaStreamService.on(MediaEvents.ERROR, (error) => {
        this._notifyError({ source: 'camera/microphone', error })
      }),
      this.configService.on('videoConfigChanged', async (event) => {
        if (!this.state.isEnabled) return

        try {
          if (event.property === 'deviceId' && !this.isSwitchingDevice) {
            await this.mediaStreamService.switchVideoDevice()
          } else if (['resolution', 'frameRate', 'constraints'].includes(event.property)) {
            await this.restart()
          }
        } catch (error) {
          this._notifyError({ source: 'camera', action: 'configUpdate', error })
        }
      }),
    )
  }

  destroy(): void {
    this.stopPreview()
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.stateCallbacks.clear()
    this.errorCallbacks.clear()
  }

  updateResolution = (width: number, height: number): void => {
    this.configService.setVideoResolution(width, height)
  }

  updateFrameRate = (frameRate: number): void => {
    this.configService.setVideoFrameRate(frameRate)
  }

  updateDevice = async (deviceId: string): Promise<void> => {
    this.configService.setVideoDevice(deviceId)
  }

  updateConstraints = (constraints: MediaTrackConstraints): void => {
    const currentConfig = this.configService.getVideoConfig()
    this.configService.updateVideoConfig({
      constraints: { ...currentConfig.constraints, ...constraints },
    })
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
        this.configService.setVideoDevice(deviceId)
      }

      await this.mediaStreamService.enableVideo()
      this.configService.updateVideoConfig({ enabled: true })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'enable', error })
      throw error
    }
  }

  disable = (): void => {
    try {
      this.mediaStreamService.disableVideo()
      this.configService.updateVideoConfig({ enabled: false })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'disable', error })
      throw error
    }
  }

  toggle = async (): Promise<void> => {
    const mediaState = this.mediaStreamService.getState()

    if (mediaState.isVideoEnabled) {
      this.disable()
      return Promise.resolve()
    } else {
      return this.enable()
    }
  }

  switchDevice = async (deviceId: string): Promise<void> => {
    try {
      this.isSwitchingDevice = true
      this.configService.setVideoDevice(deviceId)
      if (this.state.isEnabled) {
        await this.mediaStreamService.switchVideoDevice(deviceId)
      }
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'switch', error })
      throw error
    } finally {
      this.isSwitchingDevice = false
    }
  }

  toggleFacing = async (): Promise<void> => {
    try {
      const currentFacing = this.configService.getVideoConfig().facingMode || 'user'
      const newFacing = currentFacing === 'user' ? 'environment' : 'user'

      this.configService.updateVideoConfig({
        facingMode: newFacing,
        deviceId: null,
      })

      if (this.state.isEnabled) {
        await this.mediaStreamService.switchVideoDevice()
      }
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'toggleFacing', error })
      throw error
    }
  }

  /**
   * Создать preview трек для предпросмотра камеры (настройки, выбор устройства)
   * Трек НЕ добавляется в основной stream
   */
  preview = async (deviceId?: string): Promise<MediaStreamTrack> => {
    // Останавливаем предыдущий preview если есть
    this.stopPreview()

    try {
      const config = this.configService.getVideoConfig()
      const effectiveConfig = deviceId ? { ...config, deviceId } : config
      const constraints = ConstraintsBuilderService.buildVideoConstraints(effectiveConfig)

      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints })
      this.previewTrack = stream.getVideoTracks()[0]

      this._notifyStateChange(this.state)
      return this.previewTrack
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'preview', error })
      throw error
    }
  }

  /**
   * Опубликовать preview трек в основной stream
   * После вызова preview трек становится основным треком камеры
   */
  publishPreview = async (): Promise<void> => {
    if (!this.previewTrack) {
      throw new Error('No preview track to publish. Call preview() first.')
    }

    try {
      const track = this.previewTrack
      this.previewTrack = null

      await this.mediaStreamService.enableVideoWithTrack(track)
      this.configService.updateVideoConfig({ enabled: true })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'publishPreview', error })
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
      this.disable()
    }
  }

  onTrackReplaced = (callback: (event: { oldTrack: MediaStreamTrack; newTrack: MediaStreamTrack; source?: 'device' | 'background' }) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.TRACK_REPLACED, (event) => {
      if (event.kind === 'video') {
        callback({ oldTrack: event.oldTrack!, newTrack: event.track, source: (event as any).source })
      }
    })
  }

  getConfiguration = (): VideoConfiguration => {
    return this.configService.getVideoConfig()
  }

  onStateChange = (callback: CameraStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onError = (callback: ErrorCallback): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private _notifyStateChange(state: CameraState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyError(error: MediaErrorEvent): void {
    if (error.source === 'camera' || error.source === 'camera/microphone') {
      this.errorCallbacks.forEach((callback) => callback(error))
    }
  }

  getStream(): MediaStream | null {
    return this.mediaStreamService.getStream()
  }

  getTrack(): MediaStreamTrack | null {
    return this.mediaStreamService.getVideoTrack()
  }

  get state(): CameraState {
    const mediaState = this.mediaStreamService.getState()
    // Use the raw camera track for settings (not the pipeline output track,
    // which is a canvas capture stream and lacks proper width/height/frameRate)
    const rawTrack = this.mediaStreamService.getVideoTrackManager().getRawTrack()
    const settings = rawTrack?.getSettings() ?? null

    return {
      isEnabled: mediaState.isVideoEnabled,
      isMuted: mediaState.isVideoMuted,
      isPreviewing: this.previewTrack !== null,
      hasDevice: mediaState.hasVideo,
      deviceId: mediaState.currentVideoDevice,
      settings,
    }
  }
}
