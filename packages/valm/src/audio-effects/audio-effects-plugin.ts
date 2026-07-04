import { IMediaPlugin, PluginContext } from '../core'
import { IAudioNoiseSuppressionProvider, IAudioProcessingPipeline } from '../core/media-stream/audio-processing-pipeline.service'

export interface AudioEffectsProviders {
  // ML-шумоподавление (RNNoise и т.п.)
  noiseSuppression?: IAudioNoiseSuppressionProvider
}

export interface AudioEffectsPluginOptions {
  providers?: AudioEffectsProviders
}

// Плагин ML аудио-обработки: вставляет провайдера в аудио-граф микрофона
export class AudioEffectsPlugin implements IMediaPlugin {
  readonly name = 'audio-effects'

  private _options: AudioEffectsPluginOptions
  private _pipeline: IAudioProcessingPipeline | null = null

  constructor(options: AudioEffectsPluginOptions = {}) {
    this._options = options
  }

  get isInstalled(): boolean {
    return this._pipeline !== null
  }

  install(context: PluginContext): void {
    this._pipeline = context.mediaStreamService.getAudioProcessingPipeline()

    const noiseSuppression = this._options.providers?.noiseSuppression
    if (noiseSuppression) {
      void this._pipeline.setNoiseSuppressionProvider(noiseSuppression)
      void context.mediaStreamService.engageAudioProcessing()
    }
  }

  destroy(): void {
    void this._pipeline?.setNoiseSuppressionProvider(null)
    this._pipeline = null
  }
}
