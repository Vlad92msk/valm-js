export interface TranscriptionConfiguration {
  enabled: boolean
  autoStart: boolean
  language: string
  interimResults: boolean
  saveTranscripts: boolean
  // Не слушать, пока микрофон Valm в mute (по умолчанию true)
  pauseOnMute: boolean
}

// idle — не запрошено; starting — сессия открывается; listening — браузер слушает;
// restarting — пауза между сессиями (тишина, ошибка сети); paused — запрошено, но микрофон в mute или выключен
export type TranscriptionStatus = 'idle' | 'starting' | 'listening' | 'restarting' | 'paused'

// manual — stop(); aborted — сессию забрала другая вкладка или сайт; error — фатальная ошибка
export type TranscriptionStopReason = 'manual' | 'aborted' | 'error'

export type TranscriptionErrorCode = SpeechRecognitionErrorEvent['error']

export interface TranscriptionState {
  isActive: boolean
  isSupported: boolean
  currentLanguage: string
  status: TranscriptionStatus
  stopReason: TranscriptionStopReason | null
}

export interface TranscriptItem {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
  // Индекс результата в сессии распознавания: один и тот же у промежуточных версий фразы и её финала
  resultIndex: number
}

// Одно событие распознавания целиком
export interface TranscriptEvent {
  final: string
  interim: string
  items: TranscriptItem[]
  timestamp: number
}

export interface TranscriptionError {
  error: unknown
  code?: TranscriptionErrorCode
  action: 'session' | 'restart'
}

export type TranscriptCallback = (transcript: TranscriptItem) => void
export type TranscriptEventCallback = (event: TranscriptEvent) => void
export type TranscriptionStateChangeCallback = (state: TranscriptionState) => void

export enum TranscriptionEvents {
  STARTED = 'transcription:started',
  STOPPED = 'transcription:stopped',
  STATUS_CHANGED = 'transcription:statusChanged',
  TRANSCRIPT = 'transcription:transcript',
  TRANSCRIPT_EVENT = 'transcription:transcriptEvent',
  ERROR = 'transcription:error',
}
