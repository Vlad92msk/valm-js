// types/speech-recognition.types.ts
// Глобальные типы для Web Speech API

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    start(): void
    stop(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
  }

  interface SpeechRecognitionEvent extends Event {
    resultIndex: number
    results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: 'no-speech' | 'aborted' | 'audio-capture' | 'network' | 'not-allowed' | 'service-not-allowed' | 'bad-grammar' | 'language-not-supported'
    message?: string
  }

  interface SpeechRecognitionResultList {
    readonly length: number
    item(index: number): SpeechRecognitionResult
    [index: number]: SpeechRecognitionResult
  }

  interface SpeechRecognitionResult {
    readonly length: number
    readonly isFinal: boolean
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
  }

  var SpeechRecognition: {
    prototype: SpeechRecognition
    new (): SpeechRecognition
  }
}

export {}

// Дополнительные утилиты для работы с языками
export const SUPPORTED_LANGUAGES = {
  'ru-RU': 'Русский',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'de-DE': 'Deutsch',
  'fr-FR': 'Français',
  'es-ES': 'Español',
  'it-IT': 'Italiano',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'zh-CN': '中文 (简体)',
  'zh-TW': '中文 (繁體)',
} as const

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES

export function isSpeechRecognitionSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

export function getSpeechRecognitionConstructor(): typeof SpeechRecognition | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}
