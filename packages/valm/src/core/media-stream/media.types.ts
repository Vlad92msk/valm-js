import { ValmConfiguration } from '../configuration/configuration.types'
import { ScreenShareState } from '../screen-share/screen-share.types'
import { TranscriptionState } from '../transcription/transcription.types'
import { EffectsState } from '../../effects'
import { DevicesState } from './device.types'

export interface CameraState {
  isEnabled: boolean
  isMuted: boolean
  isPreviewing: boolean
  hasDevice: boolean
  deviceId: string | null
  settings: MediaTrackSettings | null
}

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
