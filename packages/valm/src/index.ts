// ============================================
// Core
// ============================================
export { Valm } from './core/valm'
export type { ValmSnapshot } from './core/valm'

// ============================================
// Plugins
// ============================================
export { EffectsPlugin } from './effects/effects-plugin'
export type { EffectsPluginOptions } from './effects/effects-plugin'
export type { IMediaPlugin, PluginContext } from './core/plugin.types'

// ============================================
// Controllers
// ============================================
export { CameraController } from './core/media-stream/controllers/camera.controller'
export { MicrophoneController } from './core/media-stream/controllers/microphone.controller'
export { DevicesController } from './core/media-stream/controllers/devices.controller'
export { AudioOutputController } from './core/media-stream/controllers/audio-output.controller'
export { EffectsController, EffectsEvents } from './effects/effects.controller'
export { ConfigurationController } from './core/configuration/controllers/configuration.controller'
export { RecordingController } from './core/recording/controllers/recording.controller'
export { ScreenShareController } from './core/screen-share/controllers/screen-share.controller'
export { TranscriptionController } from './core/transcription/controllers/transcription.controller'

// ============================================
// Services
// ============================================
export { PermissionsService } from './core/permissions'

// ============================================
// Types
// ============================================
export * from './core/types'
export type { EffectsState, EffectsStateChangeCallback, EffectsErrorCallback } from './effects/effects.controller'
export type { RecordingState } from './core/recording/recording.service'
export type { TranscriptionState } from './core/transcription/transcription.types'
export type { ValmEvents } from './core/media-stream/manager-events.types'
export { EffectType, EffectFeature } from './effects/types'
export type { QualityPreset, PerformanceConfig, IVideoEffect, IVideoProcessingPipeline, FrameContext, IMLProvider } from './effects/types'
export { BaseMLProvider } from './effects/providers/baseML.provider'
export type { IBaseMLProviderOptions } from './effects/providers/baseML.provider'
export { SegmentationProvider } from './effects/providers/segmentation.provider'
export type { SegmentationProviderOptions } from './effects/providers/segmentation.provider'
export { FaceMeshProvider } from './effects/providers/face-mesh.provider'
export type { FaceMeshProviderOptions } from './effects/providers/face-mesh.provider'
export { BaseEffect } from './effects/effects/base-effect'
export type { SegmentationConfig, SegmentationResult } from './effects/providers/segmentation.client'
export type { FaceMeshWorkerConfig, FaceMeshWorkerResult, FaceLandmark } from './effects/providers/face-mesh.client'
export type { CustomProvidersConfig } from './effects/pipeline/ml-providers-manager'
export type { BackgroundBlurParams } from './effects/effects/background-blur-effect'
export { BlurMode } from './effects/effects/background-blur-effect'
export type { VirtualBackgroundParams } from './effects/effects/virtual-background-effect'
export { BackgroundFitMode } from './effects/effects/virtual-background-effect'

// ============================================
// Utilities
// ============================================
export { DeviceDetector } from './core/utils/device-detector'
export { TypedEventEmitter } from './core/utils/typed-event-emitter'
export type { VoiceActivityConfig } from './core/utils/voice-activity-detector'
export { VoiceActivityDetector } from './core/utils/voice-activity-detector'
export { isIOS, isIOSSafari, isIOSChrome, requestIOSMediaPermissions } from './core/utils/ios-media.helper'
