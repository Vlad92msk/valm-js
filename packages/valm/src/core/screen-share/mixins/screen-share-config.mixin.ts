import { ConfigurationChangeEvent, ScreenShareConfiguration } from '../../types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const DEFAULT_SCREENSHARE_CONFIG: ScreenShareConfiguration = {
  preferDisplaySurface: 'monitor',
  includeAudio: false,
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 30,
  contentHint: 'detail',
}

export function WithScreenShareConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T) {
  return class ScreenShareConfigMixin extends Base {
    protected getDefaultConfig() {
      return {
        ...super.getDefaultConfig(),
        screenShare: DEFAULT_SCREENSHARE_CONFIG,
      }
    }

    protected setupValidators() {
      super.setupValidators()
      this.validators.set('screenShare.maxWidth', (value) => !value || (Number.isInteger(value) && value > 0))
      this.validators.set('screenShare.maxHeight', (value) => !value || (Number.isInteger(value) && value > 0))
      this.validators.set('screenShare.maxFrameRate', (value) => !value || (Number.isInteger(value) && value > 0))
    }

    getScreenShareConfig(): ScreenShareConfiguration {
      return this.deepClone(this.config.screenShare)
    }

    updateScreenShareConfig(updates: Partial<ScreenShareConfiguration>): void {
      const oldConfig = this.deepClone(this.config.screenShare)
      const entries = Object.entries(updates)
      entries.forEach(([key, value]) => {
        const path = `screenShare.${key}`
        if (this.validators.has(path)) {
          this.validateAndSet(path, value)
        }
      })
      entries.forEach(([key, value]) => {
        this.config.screenShare[key] = value
      })
      this.emitChange('screenShare', 'update', oldConfig, this.config.screenShare)
    }
  }
}

export interface ScreenShareEvents {
  screenShareConfigChanged: (event: ConfigurationChangeEvent) => void
}
