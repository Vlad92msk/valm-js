// Перевод голоса: контракт провайдера (транспорта), состояние и события.
//
// Устройство:
//   VoiceTranslatePlugin  — ставится через valm.use(); пока перевод не включён, ничего не делает
//   VoiceTranslateController — enable / disable / смена языка; все события — через on() / onAny()
//   VoiceTranslator       — узел в аудио-графе микрофона (слот 'voice-translation' ядра):
//                           захват + ресемплинг → транспорт → очередь перевода → ресемплинг → выход
//   IVoiceTranslationTransport — «PCM16 на входе → PCM16 на выходе» конкретного сервиса.
//                           Новый сервис = новый транспорт, ядро и переводчик не меняются.

// ── Состояние ─────────────────────────────────────────────

export type VoiceTranslateStatus = 'idle' | 'connecting' | 'active' | 'error'

export type VoiceTranslateErrorReason =
  | 'invalid-key' // ключ / токен отвергнут
  | 'quota' // лимит запросов или квоты (HTTP 429, RESOURCE_EXHAUSTED)
  | 'network' // соединение не открылось или оборвалось
  | 'unsupported' // в браузере нет AudioWorklet / WebSocket
  | 'server' // сервис закрыл сессию с ошибкой
  | 'unknown'

export interface VoiceTranslateError {
  reason: VoiceTranslateErrorReason
  // Текст сервиса как есть (без ключа)
  message: string
  // Код сервиса: код закрытия WebSocket, HTTP-статус, 'RESOURCE_EXHAUSTED' и т.п.
  code?: string | number
  providerId: string
}

// Что сейчас со звуком
export type VoiceTranslateActivity =
  | 'silent' // говорящий молчит, перевода в очереди нет
  | 'listening' // говорящий говорит, перевод ещё не пошёл (на выходе — тишина)
  | 'translating' // на выходе звучит перевод

// Замеры задержки, мс; null — замера ещё не было
export interface VoiceTranslateLatency {
  // начало фразы → первый звук перевода
  lastStartToFirstAudioMs: number | null
  // конец фразы → начало перевода (только если перевод начался после конца фразы)
  lastEndToFirstAudioMs: number | null
  // конец фразы → конец звучания перевода
  lastEndToFinishMs: number | null
  avgStartToFirstAudioMs: number | null
  avgEndToFinishMs: number | null
  // сколько фраз в среднем «конец → конец перевода»
  samples: number
}

// Объём звука сессии — провайдеры считают стоимость по секундам
export interface VoiceTranslateUsage {
  inputSeconds: number
  outputSeconds: number
}

export interface VoiceTranslateState {
  // Перевод включён (enable) — даже если микрофон выключен и сессии пока нет
  isEnabled: boolean
  status: VoiceTranslateStatus
  error: VoiceTranslateError | null
  activity: VoiceTranslateActivity
  providerId: string | null
  targetLanguage: string | null
  // Язык говорящего, определённый сервисом (BCP-47)
  detectedLanguage: string | null
  // Отправка звука приостановлена (микрофон заглушён)
  isInputPaused: boolean
  latency: VoiceTranslateLatency
  usage: VoiceTranslateUsage
}

// ── Параметры ─────────────────────────────────────────────

// Речь, уже сказанная на целевом языке:
//   'pass'    — пропускать (сервис повторяет её на выходе), по умолчанию;
//   'silence' — молчать (в звонке тишина: оригинал не идёт, перевода нет)
export type SameLanguageSpeech = 'pass' | 'silence'

// Что звучит на выходе, когда сессия в ошибке:
//   'original' — исходный голос (по умолчанию: собеседники слышат хотя бы оригинал);
//   'silence'  — тишина
export type VoiceTranslateErrorFallback = 'original' | 'silence'

// Параметры сессии, которые получает транспорт
export interface VoiceTranslateSessionOptions {
  // BCP-47 язык перевода из transport.info.languages. Одна сессия — один язык.
  targetLanguage: string
  sameLanguageSpeech: SameLanguageSpeech
}

// ── Транспорт: «PCM → PCM» конкретного сервиса ────────────

export interface VoiceTranslateLanguage {
  code: string // BCP-47: 'en', 'pt-BR', 'zh-Hans'
  name: string // название по-английски: 'English'
}

// Способ доступа:
//   'api-key'         — ключ пользователя прямо из браузера;
//   'ephemeral-token' — короткий токен (выпускает браузер из ключа или сервер приложения)
export type VoiceTranslateAuthMode = 'api-key' | 'ephemeral-token'

export interface VoiceTranslationTransportInfo {
  id: string // 'gemini-live-translate'
  label: string // 'Gemini Live Translate'
  format: {
    inputSampleRate: number // что ждёт сервис (Gemini — 16000)
    outputSampleRate: number // что отдаёт (Gemini — 24000)
    chunkMs: number // размер чанка на вход (Gemini — 100)
  }
  languages: readonly VoiceTranslateLanguage[]
  authModes: readonly VoiceTranslateAuthMode[]
  capabilities: {
    sourceAutoDetect: boolean // язык говорящего определяется сам
    sameLanguagePass: boolean // умеет 'pass' для речи на целевом языке
    voiceSelection: boolean
  }
  // Подсказки для UI
  links?: {
    apiKey?: string
    limits?: string
    pricing?: string
  }
}

export interface VoiceTranscriptChunk {
  kind: 'input' | 'output' // input — речь говорящего, output — перевод
  text: string
  // Черновой текст, пока человек говорит (сервис может его поправить)
  isInterim: boolean
  languageCode?: string
}

export type VoiceTranslateReconnectReason = 'go-away' | 'language-changed' | 'options-changed' | 'graph-restarted' | 'input-resumed'

export interface VoiceTranslateSessionClose {
  code?: number
  reason?: string
  willReconnect: boolean
}

// Колбэки, которые транспорт вызывает в переводчике
export interface VoiceTranslationTransportEvents {
  onOpen(): void // соединение открыто, сессия настраивается
  onReady(): void // сессия готова принимать звук
  onAudio(pcm: Int16Array): void // PCM16 моно, info.format.outputSampleRate
  onTranscript(chunk: VoiceTranscriptChunk): void
  onInterrupted(): void // сервис прервал ответ — недоигранное сбросить
  onTurnComplete(): void
  onReconnecting(reason: VoiceTranslateReconnectReason): void
  onError(error: Omit<VoiceTranslateError, 'providerId'>): void
  onClose(close: VoiceTranslateSessionClose): void
  // Каждое сообщение сервиса как есть — для отладки (ключей в них нет)
  onRawEvent(type: string, data: unknown): void
}

export interface IVoiceTranslationTransport {
  readonly info: VoiceTranslationTransportInfo

  connect(options: VoiceTranslateSessionOptions, events: VoiceTranslationTransportEvents): void
  // PCM16 моно, info.format.inputSampleRate, по info.format.chunkMs
  sendAudio(pcm: Int16Array): void
  // Звук прервался надолго (микрофон заглушён) — сервис может закончить фразу
  endAudioStream?(): void
  close(): void
}

// ── События ───────────────────────────────────────────────

export enum VoiceTranslateEvents {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  STATE_CHANGED = 'stateChanged',
  STATUS_CHANGED = 'statusChanged',
  ACTIVITY_CHANGED = 'activityChanged',
  LATENCY_CHANGED = 'latencyChanged',
  USAGE_CHANGED = 'usageChanged',
  TRANSCRIPT = 'transcript',
  LANGUAGE_DETECTED = 'languageDetected',
  TRANSLATED_AUDIO = 'translatedAudio',
  INTERRUPTED = 'interrupted',
  TURN_COMPLETE = 'turnComplete',
  SESSION_OPENED = 'sessionOpened',
  SESSION_CLOSED = 'sessionClosed',
  RECONNECTING = 'reconnecting',
  INPUT_PAUSED = 'inputPaused',
  ERROR = 'error',
  PROVIDER_EVENT = 'providerEvent',
}

export interface VoiceTranscriptEvent extends VoiceTranscriptChunk {
  // Текст текущего хода целиком (без черновиков); в финальном событии — итог
  turnText: string
  // true — ход завершён, turnText окончательный
  isFinal: boolean
  timestamp: number
}

export interface VoiceTranslateEventMap {
  [VoiceTranslateEvents.ENABLED]: (data: { providerId: string; targetLanguage: string }) => void
  [VoiceTranslateEvents.DISABLED]: () => void
  [VoiceTranslateEvents.STATE_CHANGED]: (state: VoiceTranslateState) => void
  [VoiceTranslateEvents.STATUS_CHANGED]: (data: { status: VoiceTranslateStatus; previous: VoiceTranslateStatus; error: VoiceTranslateError | null }) => void
  [VoiceTranslateEvents.ACTIVITY_CHANGED]: (data: { activity: VoiceTranslateActivity; previous: VoiceTranslateActivity }) => void
  [VoiceTranslateEvents.LATENCY_CHANGED]: (latency: VoiceTranslateLatency) => void
  [VoiceTranslateEvents.USAGE_CHANGED]: (usage: VoiceTranslateUsage) => void
  [VoiceTranslateEvents.TRANSCRIPT]: (event: VoiceTranscriptEvent) => void
  [VoiceTranslateEvents.LANGUAGE_DETECTED]: (data: { languageCode: string; previous: string | null }) => void
  // Пришёл кусок перевода: длительность и уровень (0..1)
  [VoiceTranslateEvents.TRANSLATED_AUDIO]: (data: { durationMs: number; rms: number; peak: number }) => void
  [VoiceTranslateEvents.INTERRUPTED]: () => void
  [VoiceTranslateEvents.TURN_COMPLETE]: (data: { inputText: string; outputText: string }) => void
  [VoiceTranslateEvents.SESSION_OPENED]: (data: { providerId: string; targetLanguage: string; isReconnect: boolean }) => void
  [VoiceTranslateEvents.SESSION_CLOSED]: (data: VoiceTranslateSessionClose) => void
  [VoiceTranslateEvents.RECONNECTING]: (data: { reason: VoiceTranslateReconnectReason }) => void
  [VoiceTranslateEvents.INPUT_PAUSED]: (data: { isPaused: boolean }) => void
  [VoiceTranslateEvents.ERROR]: (error: VoiceTranslateError) => void
  [VoiceTranslateEvents.PROVIDER_EVENT]: (data: { providerId: string; type: string; data: unknown }) => void
}

// Любое событие одним объектом — для onAny()
export type VoiceTranslateAnyEvent = {
  [K in keyof VoiceTranslateEventMap]: { type: K; payload: Parameters<VoiceTranslateEventMap[K]>[0] }
}[keyof VoiceTranslateEventMap]
