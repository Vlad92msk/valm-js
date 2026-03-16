export interface TranscriptionConfiguration {
  enabled: boolean
  autoStart: boolean
  language: string
  interimResults: boolean
  saveTranscripts: boolean
}

export interface TranscriptionState {
  isActive: boolean
  isSupported: boolean
  currentLanguage: string
}

export interface TranscriptItem {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
}

export type TranscriptCallback = (transcript: TranscriptItem) => void
export type TranscriptionStateChangeCallback = (state: TranscriptionState) => void

export enum TranscriptionEvents {
  STARTED = 'transcription:started',
  STOPPED = 'transcription:stopped',
  TRANSCRIPT = 'transcription:transcript',
  ERROR = 'transcription:error',
}
