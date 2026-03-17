import { ConfigurationService } from './configuration'
import { MediaStreamService } from './media-stream'

// Контекст, передаваемый плагину при install()
export interface PluginContext {
  mediaStreamService: MediaStreamService
  configurationService: ConfigurationService
}

export interface IMediaPlugin {
  readonly name: string
  install(context: PluginContext): void
  destroy(): void
}
