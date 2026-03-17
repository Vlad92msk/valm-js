import { DevicesState } from './device.types'
import { MediaErrorEvent, VolumeChangeEvent } from '../types'
import { CameraState, MicrophoneState } from './media.types'
import { ScreenShareState } from '../screen-share/screen-share.types'

export type CameraStateChangeCallback = (state: CameraState) => void
export type MicrophoneStateChangeCallback = (state: MicrophoneState) => void
export type ScreenShareStateChangeCallback = (state: ScreenShareState) => void
export type VolumeChangeCallback = (data: VolumeChangeEvent) => void
export type DevicesChangeCallback = (devices: DevicesState) => void
export type ErrorCallback = (error: MediaErrorEvent) => void
