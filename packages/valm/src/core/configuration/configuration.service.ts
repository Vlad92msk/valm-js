import { ValmConfiguration } from '../types'
import { WithAudioConfiguration, WithVideoConfiguration } from '../media-stream'
import { WithRecordingConfiguration } from '../recording'
import { WithScreenShareConfiguration } from '../screen-share'
import { WithTranscriptionConfiguration } from '../transcription'
import { composeMixins } from '../utils/compose-mixins'
import { BaseConfigurationService } from './mixins/base.mixin'

const ConfigurationServiceMixins = composeMixins(
  BaseConfigurationService,
  WithVideoConfiguration,
  WithAudioConfiguration,
  WithScreenShareConfiguration,
  WithRecordingConfiguration,
  WithTranscriptionConfiguration,
)

export class ConfigurationService extends ConfigurationServiceMixins {
  // Сужаем тип config до полного ValmConfiguration
  // (после composeMixins все секции гарантированно заполнены через getDefaultConfig)
  declare protected config: ValmConfiguration

  constructor(initialConfig: Partial<ValmConfiguration> = {}) {
    super(initialConfig)
  }

  getConfig(): ValmConfiguration {
    return this.deepClone(this.config)
  }

  resetAll(): void {
    const oldConfig = this.deepClone(this.config)
    this.config = this.deepClone(this.getCachedDefaultConfig()) as ValmConfiguration
    this.emit('configReset', { oldConfig, newConfig: this.config })
  }

  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  importConfig(configJson: string): void {
    try {
      const importedConfig = JSON.parse(configJson)
      const oldConfig = this.deepClone(this.config)
      this.config = this.deepMerge(this.getCachedDefaultConfig(), importedConfig)
      this.emit('configImported', { oldConfig, newConfig: this.config })
    } catch (error) {
      throw new Error('Invalid configuration format')
    }
  }
}
