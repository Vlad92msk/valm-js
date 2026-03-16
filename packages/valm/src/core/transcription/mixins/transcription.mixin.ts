import { ConfigurationChangeEvent } from '../../types'
import { TranscriptionConfiguration } from '../transcription.types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfiguration = {
  enabled: false,
  autoStart: false,
  language: 'ru-RU',
  interimResults: true,
  saveTranscripts: false,
}

export function WithTranscriptionConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T) {
  return class TranscriptionConfigMixin extends Base {
    protected getDefaultConfig() {
      return {
        ...super.getDefaultConfig(),
        transcription: DEFAULT_TRANSCRIPTION_CONFIG,
      }
    }

    protected setupValidators() {
      super.setupValidators()
      this.validators.set('transcription.language', (value) => typeof value === 'string' && value.length > 0)
    }

    getTranscriptionConfig(): TranscriptionConfiguration {
      return this.deepClone(this.config.transcription)
    }

    updateTranscriptionConfig(updates: Partial<TranscriptionConfiguration>): void {
      const oldConfig = this.deepClone(this.config.transcription)
      const entries = Object.entries(updates)
      entries.forEach(([key, value]) => {
        const path = `transcription.${key}`
        if (this.validators.has(path)) {
          this.validateAndSet(path, value)
        }
      })
      entries.forEach(([key, value]) => {
        this.config.transcription[key] = value
      })
      this.emitChange('transcription', 'update', oldConfig, this.config.transcription)
    }

    setTranscriptionLanguage(language: string): void {
      const oldValue = this.config.transcription.language
      this.validateAndSet('transcription.language', language)
      this.config.transcription.language = language
      this.emitChange('transcription', 'language', oldValue, language)
    }

    toggleTranscriptionEnabled(): boolean {
      const newValue = !this.config.transcription.enabled
      const oldValue = this.config.transcription.enabled
      this.config.transcription.enabled = newValue
      this.emitChange('transcription', 'enabled', oldValue, newValue)
      return newValue
    }

    toggleAutoStart(): boolean {
      const newValue = !this.config.transcription.autoStart
      const oldValue = this.config.transcription.autoStart
      this.config.transcription.autoStart = newValue
      this.emitChange('transcription', 'autoStart', oldValue, newValue)
      return newValue
    }

    resetTranscriptionConfig(): void {
      const oldConfig = this.deepClone(this.config.transcription)
      this.config.transcription = this.deepClone(this.getDefaultConfig().transcription)
      this.emitChange('transcription', 'reset', oldConfig, this.config.transcription)
    }
  }
}

export interface TranscriptionEvents {
  transcriptionConfigChanged: (event: ConfigurationChangeEvent) => void
}
