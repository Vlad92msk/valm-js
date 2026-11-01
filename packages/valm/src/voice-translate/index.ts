export { VoiceTranslatePlugin } from './voice-translate-plugin'
export { VoiceTranslateController } from './voice-translate.controller'
export type { VoiceTranslateEnableOptions } from './voice-translate.controller'

// Общая часть провайдеров: узел аудио-графа, ресемплинг, задержка, транскрипты
export { VoiceTranslator } from './voice-translator'
export type { VoiceTranslatorOptions } from './voice-translator'
export { pcm16ToBase64, base64ToPcm16 } from './pcm-codec'

// Встроенный провайдер: Gemini Live Translate
export {
  GeminiLiveTranslateTransport,
  GEMINI_TRANSLATE_MODEL,
  GEMINI_TRANSLATE_LANGUAGES,
  createGeminiEphemeralToken,
  geminiTokenFromApiKey,
  classifyGeminiError,
} from './providers/gemini/gemini-live-translate.transport'
export type {
  GeminiAuth,
  GeminiLiveTranslateTransportOptions,
  GeminiEphemeralTokenOptions,
  GeminiLiveSetup,
} from './providers/gemini/gemini-live-translate.transport'

export { VoiceTranslateEvents } from './voice-translate.types'
export type {
  IVoiceTranslationTransport,
  VoiceTranslationTransportInfo,
  VoiceTranslationTransportEvents,
  VoiceTranslateAuthMode,
  VoiceTranslateLanguage,
  VoiceTranslateSessionOptions,
  VoiceTranslateSessionClose,
  VoiceTranslateReconnectReason,
  VoiceTranscriptChunk,
  VoiceTranscriptEvent,
  VoiceTranslateState,
  VoiceTranslateStatus,
  VoiceTranslateActivity,
  VoiceTranslateError,
  VoiceTranslateErrorReason,
  VoiceTranslateErrorFallback,
  VoiceTranslateLatency,
  VoiceTranslateUsage,
  SameLanguageSpeech,
  VoiceTranslateEventMap,
  VoiceTranslateAnyEvent,
} from './voice-translate.types'

// Слот аудио-графа ядра
export type { IAudioProcessorProvider, AudioProcessorSlot } from '../core/media-stream/audio-processing-pipeline.service'
