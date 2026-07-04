import { IAudioNoiseSuppressionProvider } from '../../core/media-stream/audio-processing-pipeline.service'

export interface AudioWorkletProviderOptions {
  // URL модуля AudioWorklet
  workletUrl: string | URL
  // Имя processor'а из registerProcessor(...)
  processorName: string
  // Опции для processor'а
  processorOptions?: Record<string, unknown>
}

// Базовый провайдер: грузит AudioWorklet-модуль и создаёт узел обработки
export class AudioWorkletProvider implements IAudioNoiseSuppressionProvider {
  protected options: AudioWorkletProviderOptions

  constructor(options: AudioWorkletProviderOptions) {
    this.options = options
  }

  async createNode(context: AudioContext): Promise<AudioNode> {
    if (typeof context.audioWorklet === 'undefined') {
      throw new Error('AudioWorkletProvider: AudioWorklet не поддерживается в этом браузере')
    }

    await context.audioWorklet.addModule(this.options.workletUrl.toString())

    return new AudioWorkletNode(context, this.options.processorName, {
      processorOptions: this.options.processorOptions,
    })
  }
}
