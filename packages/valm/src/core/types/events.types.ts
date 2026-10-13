import { ValmConfiguration } from '../configuration/configuration.types'

export enum MediaEvents {
  STATE_CHANGED = 'stateChanged',
  TRACK_ADDED = 'trackAdded',
  TRACK_REMOVED = 'trackRemoved',
  TRACK_MUTED = 'trackMuted',
  TRACK_UNMUTED = 'trackUnmuted',
  DEVICE_CHANGED = 'deviceChanged',
  VOLUME_CHANGE = 'volumeChange',
  TRACK_REPLACED = 'trackReplaced',
  VIDEO_STATE_CHANGED = 'videoStateChanged',
  AUDIO_STATE_CHANGED = 'audioStateChanged',
  VIDEO_DISABLED = 'videoDisabled',
  AUDIO_DISABLED = 'audioDisabled',
  MEDIA_RESET = 'mediaReset',
  AUDIO_OUTPUT_CHANGED = 'audioOutputChanged',
  SOURCE_MUTE_CHANGED = 'sourceMuteChanged',
  TRACK_ENDED = 'trackEnded',
  DEVICE_FALLBACK = 'deviceFallback',
  ERROR = 'error',
}

export interface TrackReplacedEvent {
  kind: 'audio' | 'video'
  oldTrack: MediaStreamTrack
  newTrack: MediaStreamTrack
  stream: MediaStream
}


export type MediaErrorSource =
  | 'camera'
  | 'microphone'
  | 'camera/microphone'
  | 'screenShare'
  | 'effects'
  | 'recording'
  | 'transcription'
  | 'initialization'
  | 'cleanup'
  | 'media-stream'

export interface MediaErrorEvent {
  source: MediaErrorSource
  action?: string
  error: unknown
  // Код ошибки, если он известен (сейчас — код Web Speech API для source: 'transcription')
  code?: string
}

export interface VolumeChangeEvent {
  volume: number
  isSpeaking: boolean
}

export interface TrackEvent {
  kind: 'video' | 'audio'
  track: MediaStreamTrack
  oldTrack?: MediaStreamTrack
  stream?: MediaStream
  // Причина замены трека (только для TRACK_REPLACED, видео):
  //  'device'     — сменилось физическое устройство
  //  'background' — трек подменил пайплайн эффектов (suspend/resume)
  source?: 'device' | 'background'
  // Программный mute на момент события (для TRACK_REPLACED): новый трек уже в этом состоянии
  isMuted?: boolean
}

export interface ConfigurationChangeEvent<T = any> {
  section: keyof ValmConfiguration
  property: string
  oldValue: T
  newValue: T
  timestamp: number
}
