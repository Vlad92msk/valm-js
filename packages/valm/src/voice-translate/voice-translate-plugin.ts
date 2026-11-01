import type { IMediaPlugin, PluginContext } from '../core'
import { VoiceTranslateController } from './voice-translate.controller'

// Плагин перевода голоса. Установка ничего не включает: перевод стартует только
// по voiceTranslateController.enable({ transport, targetLanguage }).
export class VoiceTranslatePlugin implements IMediaPlugin {
  readonly name = 'voice-translate'

  private _controller: VoiceTranslateController | null = null

  // Доступен после install()
  get controller(): VoiceTranslateController {
    if (!this._controller) {
      throw new Error('VoiceTranslatePlugin не установлен. Вызовите module.use(new VoiceTranslatePlugin()) перед использованием.')
    }
    return this._controller
  }

  get isInstalled(): boolean {
    return this._controller !== null
  }

  install(context: PluginContext): void {
    this._controller = new VoiceTranslateController(context.mediaStreamService)
  }

  destroy(): void {
    this._controller?.destroy()
    this._controller = null
  }
}
