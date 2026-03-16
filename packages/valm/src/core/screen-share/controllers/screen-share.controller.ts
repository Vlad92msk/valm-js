import { ErrorCallback, ScreenShareConfiguration, MediaErrorEvent, ScreenShareState, ScreenShareStateChangeCallback } from '../../types'
import { ConfigurationService } from '../../configuration/configuration.service'
import { ScreenShareService } from '../screen-share.service'

export class ScreenShareController {
  private stateCallbacks = new Set<ScreenShareStateChangeCallback>()
  private errorCallbacks = new Set<ErrorCallback>()
  private unsubscribes: VoidFunction[] = []

  constructor(
    private configService: ConfigurationService,
    private screenShareService: ScreenShareService,
  ) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.unsubscribes.push(
      this.screenShareService.on('stateChanged', () => {
        this._notifyStateChange(this.state)
      }),
      this.screenShareService.on('error', (error) => {
        this._notifyError(error)
      }),
      this.configService.on('screenShareConfigChanged', async (event) => {
        await this.handleConfigurationChange(event)
      }),
    )
  }

  destroy(): void {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.stateCallbacks.clear()
    this.errorCallbacks.clear()
  }

  private async handleConfigurationChange(event: any): Promise<void> {
    if (this.state.isActive && event.property === 'update') {
      try {
        await this.restart()
      } catch (error) {
        this._notifyError({ source: 'screenShare', action: 'configUpdate', error })
      }
    }
  }

  // Configuration methods
  updateDisplaySurface = (surface: 'monitor' | 'window' | 'application'): void => {
    this.configService.updateScreenShareConfig({ preferDisplaySurface: surface })
  }

  updateAudioIncluded = (includeAudio: boolean): void => {
    this.configService.updateScreenShareConfig({ includeAudio })
  }

  updateMaxResolution = (maxWidth?: number, maxHeight?: number): void => {
    this.configService.updateScreenShareConfig({ maxWidth, maxHeight })
  }

  updateMaxFrameRate = (maxFrameRate?: number): void => {
    this.configService.updateScreenShareConfig({ maxFrameRate })
  }

  updateContentHint = (contentHint: 'motion' | 'detail' | 'text' | ''): void => {
    this.configService.updateScreenShareConfig({ contentHint })
  }

  private async restart(): Promise<void> {
    if (this.state.isActive) {
      this.stop()
      await this.start()
    }
  }

  start = async (): Promise<void> => {
    try {
      // Сервис сам прочитает конфигурацию
      await this.screenShareService.startScreenShare()
    } catch (error) {
      this._notifyError({ source: 'screenShare', action: 'start', error })
      throw error
    }
  }

  stop = (): void => {
    try {
      this.screenShareService.stopScreenShare()
    } catch (error) {
      this._notifyError({ source: 'screenShare', action: 'stop', error })
      throw error
    }
  }

  toggle = async (): Promise<void> => {
    if (this.state.isActive) {
      this.stop()
      return Promise.resolve()
    } else {
      return this.start()
    }
  }

  // Get current configuration
  getConfiguration = (): ScreenShareConfiguration => {
    return this.configService.getScreenShareConfig()
  }

  // Additional convenience methods
  updateConstraints = (constraints: Partial<ScreenShareConfiguration>): void => {
    this.configService.updateScreenShareConfig(constraints)
  }

  // Get active track settings (from ScreenShareService)
  getActiveSettings = (): MediaTrackSettings | null => {
    return this.screenShareService.getActiveSettings()
  }

  // Check if screen sharing is supported
  static checkCapabilities() {
    return ScreenShareService.checkCapabilities()
  }

  onStateChange = (callback: ScreenShareStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onError = (callback: ErrorCallback): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private _notifyStateChange(state: ScreenShareState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyError(error: MediaErrorEvent): void {
    if (error.source === 'screenShare') {
      this.errorCallbacks.forEach((callback) => callback(error))
    }
  }

  get state(): ScreenShareState {
    const screenState = this.screenShareService.getState()
    return {
      isActive: screenState.isActive,
      stream: screenState.stream,
    }
  }

  getStream(): MediaStream | null {
    const screenShareState = this.state
    return screenShareState.stream
  }

  getTrack(): MediaStreamTrack | null {
    const stream = this.getStream()
    return stream?.getVideoTracks()[0] || null
  }
}
