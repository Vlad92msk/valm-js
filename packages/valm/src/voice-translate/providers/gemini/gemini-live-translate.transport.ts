import { base64ToPcm16, pcm16ToBase64 } from '../../pcm-codec'
import type {
  IVoiceTranslationTransport,
  VoiceTranslateError,
  VoiceTranslateErrorReason,
  VoiceTranslateLanguage,
  VoiceTranslateSessionOptions,
  VoiceTranslationTransportEvents,
  VoiceTranslationTransportInfo,
} from '../../voice-translate.types'

// Транспорт Gemini Live Translate (модель перевода речь → речь), сырой WebSocket без SDK.
// Сверено с ai.google.dev 2026-11-01: docs/live-api/live-translate (модель, языки, форматы, translationConfig),
// api/live (сообщения), docs/ephemeral-tokens (auth_tokens).
// Ключ / токен живёт только в памяти: не сохраняется, не логируется, в события не попадает.

export const GEMINI_TRANSLATE_MODEL = 'gemini-3.5-live-translate-preview'

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService'
const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'

// Целевые языки (docs/live-api/live-translate, 2026-11-01). Язык говорящего определяется сам.
export const GEMINI_TRANSLATE_LANGUAGES: readonly VoiceTranslateLanguage[] = [
  { code: 'af', name: 'Afrikaans' },
  { code: 'ak', name: 'Akan' },
  { code: 'sq', name: 'Albanian' },
  { code: 'am', name: 'Amharic' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'eu', name: 'Basque' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'my', name: 'Burmese (Myanmar)' },
  { code: 'ca', name: 'Catalan' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'et', name: 'Estonian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'gl', name: 'Galician' },
  { code: 'ka', name: 'Georgian' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'jv', name: 'Javanese' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'rw', name: 'Kinyarwanda' },
  { code: 'ko', name: 'Korean' },
  { code: 'lo', name: 'Lao' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zu', name: 'Zulu' },
]

// Доступ:
//   api-key         — ключ в query сокета (дока: «для тестов»; работает из браузера);
//   ephemeral-token — короткий токен из auth_tokens. getToken вызывается на каждое подключение
//                     (в т.ч. переподключение по goAway). Выпустить его из ключа в браузере —
//                     geminiTokenFromApiKey(apiKey); с сервера приложения — свой getToken.
export type GeminiAuth =
  | { type: 'api-key'; apiKey: string }
  | { type: 'ephemeral-token'; getToken: (setup: GeminiLiveSetup) => Promise<string> }

export interface GeminiLiveTranslateTransportOptions {
  auth: GeminiAuth
  model?: string
}

// setup сырого WebSocket (BidiGenerateContentSetup, api/live)
export interface GeminiLiveSetup {
  model: string
  generationConfig: {
    responseModalities: ['AUDIO']
    translationConfig: { targetLanguageCode: string; echoTargetLanguage: boolean }
  }
  inputAudioTranscription: Record<string, never>
  outputAudioTranscription: Record<string, never>
}

interface GeminiTranscription {
  text?: string
  languageCode?: string
}

interface GeminiServerMessage {
  setupComplete?: object
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] }
    inputTranscription?: GeminiTranscription
    interimInputTranscription?: GeminiTranscription
    outputTranscription?: GeminiTranscription
    interrupted?: boolean
    turnComplete?: boolean
    generationComplete?: boolean
  }
  goAway?: { timeLeft?: string }
  sessionResumptionUpdate?: object
  usageMetadata?: object
  voiceActivity?: object
  error?: { code?: number; message?: string; status?: string }
}

const RAW_EVENT_KEYS = ['setupComplete', 'serverContent', 'goAway', 'sessionResumptionUpdate', 'usageMetadata', 'voiceActivity', 'error'] as const

// Важно: inputAudioTranscription / outputAudioTranscription — поля самого setup, а не generationConfig
// (пример в docs/live-api/live-translate кладёт их в generationConfig — сервис отвечает
// «Unknown name "inputAudioTranscription" at 'setup.generation_config'», проверено 2026-11-01).
const buildSetup = (model: string, options: VoiceTranslateSessionOptions): GeminiLiveSetup => ({
  model: `models/${model}`,
  generationConfig: {
    responseModalities: ['AUDIO'],
    translationConfig: {
      targetLanguageCode: options.targetLanguage,
      echoTargetLanguage: options.sameLanguageSpeech === 'pass',
    },
  },
  inputAudioTranscription: {},
  outputAudioTranscription: {},
})

// Причина ошибки по тексту / статусу сервиса
export const classifyGeminiError = (text: string, fallback: VoiceTranslateErrorReason): VoiceTranslateErrorReason => {
  if (/resource.?exhausted|quota|rate.?limit|too many|\b429\b/i.test(text)) return 'quota'
  if (/api.?key|unauthenticated|permission.?denied|invalid.*(key|token)|access.?token|credential|\b40[13]\b/i.test(text)) return 'invalid-key'
  return fallback
}

export class GeminiLiveTranslateTransport implements IVoiceTranslationTransport {
  readonly info: VoiceTranslationTransportInfo = {
    id: 'gemini-live-translate',
    label: 'Gemini Live Translate',
    format: { inputSampleRate: 16000, outputSampleRate: 24000, chunkMs: 100 },
    languages: GEMINI_TRANSLATE_LANGUAGES,
    authModes: ['api-key', 'ephemeral-token'],
    capabilities: { sourceAutoDetect: true, sameLanguagePass: true, voiceSelection: false },
    links: {
      apiKey: 'https://aistudio.google.com/apikey',
      limits: 'https://ai.google.dev/gemini-api/docs/rate-limits',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
    },
  }

  private options: GeminiLiveTranslateTransportOptions
  private ws: WebSocket | null = null
  private events: VoiceTranslationTransportEvents | null = null
  private session: VoiceTranslateSessionOptions | null = null
  private isGoingAway = false
  private isReady = false
  // Номер подключения: ответ getToken от прошлого подключения отбрасывается
  private attempt = 0

  constructor(options: GeminiLiveTranslateTransportOptions) {
    this.options = options
  }

  get model(): string {
    return this.options.model ?? GEMINI_TRANSLATE_MODEL
  }

  connect(options: VoiceTranslateSessionOptions, events: VoiceTranslationTransportEvents): void {
    this.close()
    this.events = events
    this.session = options
    void this.open()
  }

  sendAudio(pcm: Int16Array): void {
    if (!this.isReady || this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      realtimeInput: { audio: { data: pcm16ToBase64(pcm), mimeType: `audio/pcm;rate=${this.info.format.inputSampleRate}` } },
    }))
  }

  // Микрофон заглушён: сервис закончит фразу; следующий звук снова откроет поток
  endAudioStream(): void {
    if (!this.isReady || this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
  }

  close(): void {
    this.attempt++
    this.events = null
    this.session = null
    this.isReady = false
    this.isGoingAway = false
    this.dropSocket()
  }

  // ── внутреннее ──

  private dropSocket(): void {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000)
  }

  private async open(): Promise<void> {
    const attempt = ++this.attempt
    const session = this.session
    const events = this.events
    if (!session || !events) return
    const setup = buildSetup(this.model, session)

    let url: string
    const { auth } = this.options
    if (auth.type === 'api-key') {
      url = `${WS_BASE}.BidiGenerateContent?key=${encodeURIComponent(auth.apiKey)}`
    } else {
      try {
        const token = await auth.getToken(setup)
        if (attempt !== this.attempt) return
        url = `${WS_BASE}.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
      } catch (error) {
        if (attempt !== this.attempt) return
        events.onError(toTokenError(error))
        events.onClose({ willReconnect: false })
        return
      }
    }

    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer' // сервис шлёт JSON бинарными кадрами
    this.ws = ws
    this.isReady = false

    ws.onopen = () => {
      events.onOpen()
      ws.send(JSON.stringify({ setup }))
    }

    ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      const text = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)
      let msg: GeminiServerMessage
      try {
        msg = JSON.parse(text) as GeminiServerMessage
      } catch {
        events.onRawEvent('unparsed', text)
        return
      }
      this.handleMessage(msg, events)
    }

    ws.onerror = () => {
      // подробностей браузер не даёт — причина придёт в onclose
    }

    ws.onclose = (e: CloseEvent) => {
      if (this.ws !== ws || this.events !== events) return
      this.ws = null
      this.isReady = false
      events.onRawEvent('close', { code: e.code, reason: e.reason, wasClean: e.wasClean })

      // Сервис закрыл соединение по лимиту после goAway — новое подключение
      if (this.isGoingAway) {
        this.isGoingAway = false
        events.onClose({ code: e.code, reason: e.reason, willReconnect: true })
        events.onReconnecting('go-away')
        void this.open()
        return
      }

      if (e.code !== 1000) {
        const reason = e.reason || `WebSocket closed, code ${e.code}`
        events.onError({ reason: classifyGeminiError(reason, e.code === 1006 ? 'network' : 'server'), message: reason, code: e.code })
      }
      events.onClose({ code: e.code, reason: e.reason, willReconnect: false })
    }
  }

  private handleMessage(msg: GeminiServerMessage, events: VoiceTranslationTransportEvents): void {
    const type = RAW_EVENT_KEYS.find((key) => key in msg) ?? 'message'
    events.onRawEvent(type, msg)

    if (msg.setupComplete) {
      this.isReady = true
      events.onReady()
    }

    if (msg.error) {
      const message = msg.error.message ?? msg.error.status ?? 'Service error'
      events.onError({
        reason: classifyGeminiError(`${msg.error.status ?? ''} ${msg.error.code ?? ''} ${message}`, 'server'),
        message,
        code: msg.error.status ?? msg.error.code,
      })
    }

    if (msg.goAway) this.isGoingAway = true

    const content = msg.serverContent
    if (!content) return

    if (content.interrupted) events.onInterrupted()

    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) events.onAudio(base64ToPcm16(part.inlineData.data))
    }

    const transcripts: [GeminiTranscription | undefined, 'input' | 'output', boolean][] = [
      [content.interimInputTranscription, 'input', true],
      [content.inputTranscription, 'input', false],
      [content.outputTranscription, 'output', false],
    ]
    for (const [item, kind, isInterim] of transcripts) {
      if (item?.text) events.onTranscript({ kind, text: item.text, isInterim, languageCode: item.languageCode })
    }

    if (content.turnComplete) events.onTurnComplete()
  }
}

const toTokenError = (error: unknown): Omit<VoiceTranslateError, 'providerId'> => {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof GeminiHttpError ? error.status : undefined
  const reason: VoiceTranslateErrorReason =
    status === 429 ? 'quota' : status === 400 || status === 401 || status === 403 ? classifyGeminiError(message, 'invalid-key') : classifyGeminiError(message, status ? 'server' : 'network')
  return { reason, message, code: status }
}

class GeminiHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface GeminiEphemeralTokenOptions {
  // Сколько токен годен, мс (по умолчанию 30 мин)
  expireMs?: number
  // За сколько нужно открыть сессию по токену, мс (по умолчанию 1 мин)
  newSessionExpireMs?: number
}

// Обменять ключ на эфемерный токен (auth_tokens пускает браузер по CORS, проверено 2026-11-01).
// setup зашивается в токен: клиент по нему откроет только эту сессию, один раз.
export const createGeminiEphemeralToken = async (apiKey: string, setup: GeminiLiveSetup, options: GeminiEphemeralTokenOptions = {}): Promise<string> => {
  const now = Date.now()
  const response = await fetch(AUTH_TOKENS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + (options.expireMs ?? 30 * 60_000)).toISOString(),
      newSessionExpireTime: new Date(now + (options.newSessionExpireMs ?? 60_000)).toISOString(),
      // REST-форма AuthToken (api/live). liveConnectConstraints из docs/ephemeral-tokens — поле SDK,
      // REST его отвергает («Unknown name», 2026-11-01)
      bidiGenerateContentSetup: setup,
    }),
  })
  const body = (await response.json().catch(() => ({}))) as { name?: string; error?: { message?: string; status?: string } }
  if (!response.ok || !body.name) {
    const message = body.error?.message ?? `auth_tokens responded ${response.status}`
    throw new GeminiHttpError(body.error?.status ? `${body.error.status}: ${message}` : message, response.status)
  }
  return body.name
}

// getToken для auth: { type: 'ephemeral-token' }: токен выпускает сам браузер из ключа пользователя.
// В сокет уходит только короткий токен, ключ — только в запросе auth_tokens.
export const geminiTokenFromApiKey =
  (apiKey: string, options?: GeminiEphemeralTokenOptions) =>
  (setup: GeminiLiveSetup): Promise<string> =>
    createGeminiEphemeralToken(apiKey, setup, options)
