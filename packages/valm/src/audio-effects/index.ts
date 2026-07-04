export { AudioEffectsPlugin } from './audio-effects-plugin'
export type { AudioEffectsPluginOptions, AudioEffectsProviders } from './audio-effects-plugin'

export { AudioWorkletProvider } from './providers/audio-worklet.provider'
export type { AudioWorkletProviderOptions } from './providers/audio-worklet.provider'
export { RNNoiseProvider } from './providers/rnnoise.provider'
export type { RNNoiseProviderOptions } from './providers/rnnoise.provider'

// Реэкспорт типов провайдера/данных из ядра
export type {
  IAudioNoiseSuppressionProvider,
  IAudioProcessingPipeline,
  AudioDataCallback,
  AudioVisualizationData,
} from '../core/media-stream/audio-processing-pipeline.service'
