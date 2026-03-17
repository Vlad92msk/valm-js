import { ConfigurationService } from '../configuration'

import { MediaErrorEvent, ScreenShareState } from '../types'
import { TypedEventEmitter } from '../utils'

interface ScreenShareEventMap {
  stateChanged: (state: ScreenShareState) => void
  error: (error: MediaErrorEvent) => void
  streamStopped: (data: { streamId: string | undefined; state: ScreenShareState }) => void
  streamEnded: (data: { streamId: string | undefined; reason: string; state: ScreenShareState }) => void
  settingsUpdated: (data: { settings: MediaTrackSettings; state: ScreenShareState }) => void
}

export class ScreenShareService extends TypedEventEmitter<ScreenShareEventMap> {
  private stream: MediaStream | null = null
  private isEnabled: boolean = false
  private trackEndedHandler: (() => void) | null = null

  constructor(private configService: ConfigurationService) {
    super()
  }

  async startScreenShare(): Promise<void> {
    try {
      // Берем настройки из ConfigurationService
      const config = this.configService.getScreenShareConfig()

      const constraints = {
        video: {
          displaySurface: config.preferDisplaySurface,
          width: config.maxWidth ? { max: config.maxWidth } : undefined,
          height: config.maxHeight ? { max: config.maxHeight } : undefined,
          frameRate: config.maxFrameRate ? { max: config.maxFrameRate } : undefined,
        },
        audio: config.includeAudio || false,
      }

      if (this.stream) {
        this.stopScreenShare()
      }

      this.stream = await navigator.mediaDevices.getDisplayMedia(constraints)
      this.isEnabled = true
      this.setupStreamHandlers()

      this.emit('stateChanged', this.getState())
    } catch (error) {
      this.emit('error', { source: 'screenShare', action: 'start', error })
      throw new Error('Screen share start error: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  private setupStreamHandlers(): void {
    if (!this.stream) return

    const config = this.configService.getScreenShareConfig()

    // Сохраняем ссылку на handler для последующей отписки
    this.trackEndedHandler = () => this.handleTrackEnded()

    this.stream.getTracks().forEach((track) => {
      if (track.kind === 'video' && config.contentHint) {
        track.contentHint = config.contentHint
      }
      track.addEventListener('ended', this.trackEndedHandler!)
    })
  }

  stopScreenShare(): void {
    if (this.stream) {
      const streamId = this.stream.id

      // Снимаем listeners перед остановкой треков
      this.removeTrackListeners()

      this.stream.getTracks().forEach((track) => {
        track.stop()
      })

      this.stream = null
      this.isEnabled = false

      this.emit('streamStopped', {
        streamId,
        state: this.getState(),
      })
      this.emit('stateChanged', this.getState())
    }
  }

  private removeTrackListeners(): void {
    if (this.stream && this.trackEndedHandler) {
      this.stream.getTracks().forEach((track) => {
        track.removeEventListener('ended', this.trackEndedHandler!)
      })
    }
    this.trackEndedHandler = null
  }

  private handleTrackEnded(): void {
    // Вызывается когда пользователь останавливает шаринг через браузер
    if (this.isEnabled) {
      const streamId = this.stream?.id
      this.removeTrackListeners()
      // Останавливаем оставшиеся треки (напр. аудио, когда видео ended)
      this.stream?.getTracks().forEach((t) => t.stop())
      this.stream = null
      this.isEnabled = false

      this.emit('streamEnded', {
        streamId,
        reason: 'user_stopped',
        state: this.getState(),
      })
      this.emit('stateChanged', this.getState())
    }
  }

  isScreenSharing(): boolean {
    return this.isEnabled && this.stream !== null
  }

  getStream(): MediaStream | null {
    return this.stream
  }

  getState(): ScreenShareState {
    return {
      stream: this.stream,
      isActive: this.isEnabled,
    }
  }

  getActiveSettings(): MediaTrackSettings | null {
    if (!this.stream) return null

    const videoTrack = this.stream.getVideoTracks()[0]
    return videoTrack ? videoTrack.getSettings() : null
  }

  // Проверить поддержку screen share в браузере
  static async checkCapabilities(): Promise<{
    supported: boolean
    capabilities?: MediaTrackSupportedConstraints
  }> {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        return { supported: false }
      }

      const capabilities = navigator.mediaDevices.getSupportedConstraints?.() || {}

      return {
        supported: true,
        capabilities,
      }
    } catch (error) {
      return { supported: false }
    }
  }

  // Применить новые constraints к активному стриму
  async updateSettings(constraints: MediaTrackConstraints): Promise<void> {
    if (!this.stream) {
      throw new Error('No active stream to update settings')
    }

    try {
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        await videoTrack.applyConstraints(constraints)
        this.emit('settingsUpdated', {
          settings: videoTrack.getSettings(),
          state: this.getState(),
        })
      }
    } catch (error) {
      this.emit('error', {
        source: 'screenShare',
        action: 'updateSettings',
        error,
      })
      throw error
    }
  }

  destroy(): void {
    if (this.stream) {
      this.stopScreenShare()
    }
    this.removeAllListeners()
    this.stream = null
    this.isEnabled = false
  }
}
