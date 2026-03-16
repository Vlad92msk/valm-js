import { ConfigurationChangeEvent, AudioConfiguration } from '../../types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const DEFAULT_AUDIO_CONFIG: AudioConfiguration = {
  enabled: false,
  deviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  enableSpeakingDetection: true,
  volumeThreshold: 10,
  constraints: {},
}

export function WithAudioConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T) {
  return class AudioConfigMixin extends Base {
    protected getDefaultConfig() {
      return {
        ...super.getDefaultConfig(),
        audio: DEFAULT_AUDIO_CONFIG,
      }
    }

    protected setupValidators() {
      super.setupValidators()
      this.validators.set('audio.volumeThreshold', (value) => Number.isInteger(value) && value >= 0 && value <= 100)
    }

    getAudioConfig(): AudioConfiguration {
      return this.deepClone(this.config.audio)
    }

    updateAudioConfig(updates: Partial<AudioConfiguration>): void {
      const oldConfig = this.deepClone(this.config.audio)
      Object.entries(updates).forEach(([key, value]) => {
        const path = `audio.${key}`
        if (this.validators.has(path)) {
          this.validateAndSet(path, value)
        }
        this.config.audio[key] = value
      })
      this.emitChange('audio', 'update', oldConfig, this.config.audio)
    }

    setAudioDevice(deviceId: string | null): void {
      const oldValue = this.config.audio.deviceId
      this.config.audio.deviceId = deviceId
      this.emitChange('audio', 'deviceId', oldValue, deviceId)
    }

    setAudioProcessing(options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean }): void {
      const updates: Partial<AudioConfiguration> = {}
      if (options.echoCancellation !== undefined) updates.echoCancellation = options.echoCancellation
      if (options.noiseSuppression !== undefined) updates.noiseSuppression = options.noiseSuppression
      if (options.autoGainControl !== undefined) updates.autoGainControl = options.autoGainControl
      this.updateAudioConfig(updates)
    }

    toggleAudioEnabled(): boolean {
      const newValue = !this.config.audio.enabled
      const oldValue = this.config.audio.enabled
      this.config.audio.enabled = newValue
      this.emitChange('audio', 'enabled', oldValue, newValue)
      return newValue
    }

    resetAudioConfig(): void {
      const oldConfig = this.deepClone(this.config.audio)
      this.config.audio = this.deepClone(this.getDefaultConfig().audio)
      this.emitChange('audio', 'reset', oldConfig, this.config.audio)
    }
  }
}

export interface AudioEvents {
  audioConfigChanged: (event: ConfigurationChangeEvent) => void
}
