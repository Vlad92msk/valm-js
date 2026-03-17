// Module
export { Valm } from './valm'
export type { ValmSnapshot } from './valm'

// Plugin types
export type { IMediaPlugin, PluginContext } from './plugin.types'

// Controllers
export { CameraController } from './media-stream/controllers/camera.controller'
export { MicrophoneController } from './media-stream/controllers/microphone.controller'
export { DevicesController } from './media-stream/controllers/devices.controller'
export { AudioOutputController } from './media-stream/controllers/audio-output.controller'
export { ConfigurationController } from './configuration/controllers/configuration.controller'
export { RecordingController } from './recording/controllers/recording.controller'
export { ScreenShareController } from './screen-share/controllers/screen-share.controller'
export { TranscriptionController } from './transcription/controllers/transcription.controller'

// Services
export { PermissionsService } from './permissions/permissions.service'

// Types
export * from './types'
export type { RecordingState } from './recording/recording.service'
export type { TranscriptionState } from './transcription/transcription.types'
export type { ValmEvents } from './media-stream/manager-events.types'

// Utilities
export { DeviceDetector } from './utils/device-detector'
export { TypedEventEmitter } from './utils/typed-event-emitter'
export type { VoiceActivityConfig } from './utils/voice-activity-detector'
export { VoiceActivityDetector } from './utils/voice-activity-detector'
