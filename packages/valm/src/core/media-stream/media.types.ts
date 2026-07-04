import { ValmConfiguration } from '../configuration/configuration.types'
import { ScreenShareState } from '../screen-share/screen-share.types'
import { TranscriptionState } from '../transcription/transcription.types'
import type { EffectsState } from '../../effects'
import { DevicesState } from './device.types'

export interface CameraState {
  isEnabled: boolean
  isMuted: boolean
  isPreviewing: boolean
  hasDevice: boolean
  deviceId: string | null
  settings: MediaTrackSettings | null
}

export interface CaptureFrameOptions {
  format?: 'image/png' | 'image/jpeg' | 'image/webp' // по умолчанию 'image/png'
  quality?: number // 0–1, для jpeg/webp
  // downscale; при одном размере второй считается по пропорции
  width?: number
  height?: number
}

export interface AdvancedCameraState {
  zoom: { supported: boolean; min?: number; max?: number; step?: number; value?: number }
  torch: { supported: boolean; on: boolean }
  focus: { supported: boolean; mode?: string }
  exposure: { supported: boolean; mode?: string }
}

export type CameraFocusMode = 'continuous' | 'manual' | 'single-shot'
export type CameraExposureMode = 'continuous' | 'manual'

export interface MicrophoneState {
  isEnabled: boolean
  isMuted: boolean
  isPreviewing: boolean
  hasDevice: boolean
  deviceId: string | null
  settings: MediaTrackSettings | null
  volume: number
  isSpeaking: boolean
}

export interface LocalMediaState {
  camera: CameraState
  microphone: MicrophoneState
  screenShare: ScreenShareState
  devices: DevicesState
  transcription: TranscriptionState
  // null если EffectsPlugin не установлен
  effects: EffectsState | null
}

export interface ValmConfig extends Partial<ValmConfiguration> {
  autoInitialize?: boolean
}

export interface MediaStreamState {
  stream: MediaStream | null
  hasVideo: boolean
  hasAudio: boolean
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isVideoMuted: boolean
  isAudioMuted: boolean
  currentVideoDevice: string | null
  currentAudioDevice: string | null
  volume: number
  videoSettings: MediaTrackSettings | null
  audioSettings: MediaTrackSettings | null
  isSpeaking: boolean
}
