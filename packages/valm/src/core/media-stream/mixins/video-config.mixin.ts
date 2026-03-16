import { ConfigurationChangeEvent, VideoConfiguration } from '../../types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const DEFAULT_VIDEO_CONFIG: VideoConfiguration = {
  enabled: false,
  deviceId: null,
  resolution: { width: 1280, height: 720 },
  frameRate: 30,
  facingMode: 'user',
  constraints: {},
}

export function WithVideoConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T) {
  return class VideoConfigMixin extends Base {
    protected getDefaultConfig() {
      return {
        ...super.getDefaultConfig(),
        video: DEFAULT_VIDEO_CONFIG,
      }
    }

    protected setupValidators() {
      super.setupValidators()
      this.validators.set('video.resolution.width', (value) => Number.isInteger(value) && value > 0 && value <= 4096)
      this.validators.set('video.resolution.height', (value) => Number.isInteger(value) && value > 0 && value <= 4096)
      this.validators.set('video.frameRate', (value) => Number.isInteger(value) && value > 0 && value <= 120)
    }

    getVideoConfig(): VideoConfiguration {
      return this.deepClone(this.config.video)
    }

    updateVideoConfig(updates: Partial<VideoConfiguration>): void {
      const oldConfig = this.deepClone(this.config.video)
      Object.entries(updates).forEach(([key, value]) => {
        const path = `video.${key}`
        if (this.validators.has(path)) {
          this.validateAndSet(path, value)
        }
        this.config.video[key] = value
      })
      this.emitChange('video', 'update', oldConfig, this.config.video)
    }

    setVideoResolution(width: number, height: number): void {
      this.validateAndSet('video.resolution.width', width)
      this.validateAndSet('video.resolution.height', height)
      const oldResolution = { ...this.config.video.resolution }
      this.config.video.resolution = { width, height }
      this.emitChange('video', 'resolution', oldResolution, { width, height })
    }

    setVideoFrameRate(frameRate: number): void {
      this.validateAndSet('video.frameRate', frameRate)
      const oldValue = this.config.video.frameRate
      this.config.video.frameRate = frameRate
      this.emitChange('video', 'frameRate', oldValue, frameRate)
    }

    setVideoDevice(deviceId: string | null): void {
      const oldValue = this.config.video.deviceId
      this.config.video.deviceId = deviceId
      this.emitChange('video', 'deviceId', oldValue, deviceId)
    }

    toggleVideoEnabled(): boolean {
      const newValue = !this.config.video.enabled
      const oldValue = this.config.video.enabled
      this.config.video.enabled = newValue
      this.emitChange('video', 'enabled', oldValue, newValue)
      return newValue
    }

    resetVideoConfig(): void {
      const oldConfig = this.deepClone(this.config.video)
      this.config.video = this.deepClone(this.getDefaultConfig().video)
      this.emitChange('video', 'reset', oldConfig, this.config.video)
    }
  }
}

export interface VideoEvents {
  videoConfigChanged: (event: ConfigurationChangeEvent) => void
}
