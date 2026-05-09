import { ConfigurationChangeEvent, ScreenShareConfiguration, ScreenShareMode } from '../../types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const SCREEN_SHARE_MODE_PRESETS: Record<ScreenShareMode, { contentHint: 'motion' | 'text'; maxFrameRate: number }> = {
  presentation: { contentHint: 'text', maxFrameRate: 5 },
  video: { contentHint: 'motion', maxFrameRate: 30 },
}

export const DEFAULT_SCREENSHARE_CONFIG: ScreenShareConfiguration = {
  preferDisplaySurface: 'monitor',
  includeAudio: false,
  maxWidth: 1920,
  maxHeight: 1080,
  mode: 'presentation',
}

export interface ScreenShareConfigMixin {
  getScreenShareConfig(): ScreenShareConfiguration
  updateScreenShareConfig(updates: Partial<ScreenShareConfiguration>): void
}

export function WithScreenShareConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T): T & Constructor<ScreenShareConfigMixin> {
  return class extends Base {
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
  } as any
}

export interface ScreenShareEvents {
  screenShareConfigChanged: (event: ConfigurationChangeEvent) => void
}
