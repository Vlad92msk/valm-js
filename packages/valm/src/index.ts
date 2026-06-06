// Core
export { Valm } from './core/valm'
export type { ValmSnapshot } from './core/valm'

// Plugins
export type { IMediaPlugin, PluginContext } from './core/plugin.types'

// Controllers
export { CameraController } from './core/media-stream/controllers/camera.controller'
export { MicrophoneController } from './core/media-stream/controllers/microphone.controller'
export { DevicesController } from './core/media-stream/controllers/devices.controller'
export { AudioOutputController } from './core/media-stream/controllers/audio-output.controller'
export { ConfigurationController } from './core/configuration/controllers/configuration.controller'
export { RecordingController } from './core/recording/controllers/recording.controller'
export { ScreenShareController } from './core/screen-share/controllers/screen-share.controller'
export { TranscriptionController } from './core/transcription/controllers/transcription.controller'

// Services
export { PermissionsService } from './core/permissions'

// Types
export * from './core/types'
export type { RecordingState } from './core/recording/recording.service'
export type { TranscriptionState } from './core/transcription/transcription.types'
export type { ValmEvents } from './core/media-stream/manager-events.types'

// Utilities
export { DeviceDetector } from './core/utils/device-detector'
export { TypedEventEmitter } from './core/utils/typed-event-emitter'
export type { VoiceActivityConfig } from './core/utils/voice-activity-detector'
export { VoiceActivityDetector } from './core/utils/voice-activity-detector'
export { isIOS, isIOSSafari, isIOSChrome, requestIOSMediaPermissions } from './core/utils/ios-media.helper'

// Видео-эффекты вынесены в отдельный subpath-export "valm-js/effects",
// чтобы ядро (камера/микрофон/запись) не тянуло optional-зависимость
// @mediapipe/tasks-vision в граф сборки. См. src/effects/index.ts.
