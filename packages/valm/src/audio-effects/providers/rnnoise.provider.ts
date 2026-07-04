import { AudioWorkletProvider } from './audio-worklet.provider'

export interface RNNoiseProviderOptions {
  // URL собранного RNNoise-worklet (обязателен; DSP/wasm в пакет не входит)
  workletUrl?: string | URL
  // Имя processor'а (по умолчанию 'rnnoise-processor')
  processorName?: string
}

// Шумоподавление RNNoise поверх готового AudioWorklet-модуля
export class RNNoiseProvider extends AudioWorkletProvider {
  constructor(options: RNNoiseProviderOptions = {}) {
    super({
      workletUrl: options.workletUrl ?? '',
      processorName: options.processorName ?? 'rnnoise-processor',
    })
  }

  async createNode(context: AudioContext): Promise<AudioNode> {
    if (!this.options.workletUrl) {
      throw new Error('RNNoiseProvider: не задан workletUrl. Передайте URL собранного RNNoise-worklet: new RNNoiseProvider({ workletUrl })')
    }
    return super.createNode(context)
  }
}
