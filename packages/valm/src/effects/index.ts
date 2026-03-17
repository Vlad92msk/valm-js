export { EffectsPlugin } from './effects-plugin'
export type { EffectsPluginOptions } from './effects-plugin'

export { EffectsController, EffectsEvents } from './effects.controller'
export type { EffectsState, EffectsStateChangeCallback, EffectsErrorCallback } from './effects.controller'

export { EffectType, EffectFeature } from './types'
export type { QualityPreset, PerformanceConfig, IVideoEffect, IVideoProcessingPipeline, FrameContext, IMLProvider } from './types'

// Base classes для кастомных эффектов
export { BaseEffect } from './effects/base-effect'
export { BaseMLProvider } from './providers/baseML.provider'
export type { IBaseMLProviderOptions } from './providers/baseML.provider'

// Встроенные эффекты
export type { BackgroundBlurParams } from './effects/background-blur-effect'
export { BlurMode } from './effects/background-blur-effect'
export type { VirtualBackgroundParams } from './effects/virtual-background-effect'
export { BackgroundFitMode } from './effects/virtual-background-effect'

// Встроенные ML провайдеры
export { SegmentationProvider } from './providers/segmentation.provider'
export type { SegmentationProviderOptions } from './providers/segmentation.provider'
export { FaceMeshProvider } from './providers/face-mesh.provider'
export type { FaceMeshProviderOptions } from './providers/face-mesh.provider'

// Типы провайдеров
export type { SegmentationConfig, SegmentationResult } from './providers/segmentation.client'
export type { FaceMeshWorkerConfig, FaceMeshWorkerResult, FaceLandmark } from './providers/face-mesh.client'
export type { CustomProvidersConfig } from './pipeline/ml-providers-manager'
