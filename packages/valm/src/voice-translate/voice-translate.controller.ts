import { TypedEventEmitter } from '../core/utils/typed-event-emitter'
import { MediaEvents } from '../core/types'
import type { MediaStreamService } from '../core/media-stream'
import { VoiceTranslator, type VoiceTranslatorOptions } from './voice-translator'
import {
  VoiceTranslateEvents,
  type SameLanguageSpeech,
  type VoiceTranslateAnyEvent,
  type VoiceTranslateError,
  type VoiceTranslateErrorFallback,
  type VoiceTranslateEventMap,
  type VoiceTranslateState,
  type VoiceTranscriptEvent,
} from './voice-translate.types'

export interface VoiceTranslateEnableOptions extends VoiceTranslatorOptions {
  // Не отправлять звук, пока микрофон заглушён (по умолчанию true): сервис не считает тишину
  pauseWhenMuted?: boolean
}

const SLOT = 'voice-translation'

const DISABLED_STATE: VoiceTranslateState = {
  isEnabled: false,
  status: 'idle',
  error: null,
  activity: 'silent',
  providerId: null,
  targetLanguage: null,
  detectedLanguage: null,
  isInputPaused: false,
  latency: {
    lastStartToFirstAudioMs: null,
    lastEndToFirstAudioMs: null,
    lastEndToFinishMs: null,
    avgStartToFirstAudioMs: null,
    avgEndToFinishMs: null,
    samples: 0,
  },
  usage: { inputSeconds: 0, outputSeconds: 0 },
}

const ALL_EVENTS = Object.values(VoiceTranslateEvents) as VoiceTranslateEvents[]

// Перевод голоса говорящего. Выключен, пока не вызван enable(): до этого нет ни соединений,
// ни отправки звука, ни изменений в дорожке микрофона.
// enable() ставит переводчик в аудио-граф микрофона: публикуемая дорожка (microphoneController.getTrack())
// несёт перевод; если граф до этого не работал, valm один раз заменит дорожку (onTrackReplaced).
export class VoiceTranslateController extends TypedEventEmitter<VoiceTranslateEventMap> {
  private translator: VoiceTranslator | null = null
  private translatorUnsubs: VoidFunction[] = []
  private anyListeners = new Set<(event: VoiceTranslateAnyEvent) => void>()
  private mediaUnsubs: VoidFunction[] = []
  private pauseWhenMuted = true

  constructor(private mediaStreamService: MediaStreamService) {
    super()
    this.mediaUnsubs.push(
      this.mediaStreamService.on(MediaEvents.TRACK_MUTED, (event) => {
        if (event.kind === 'audio') this.syncInputPause()
      }),
      this.mediaStreamService.on(MediaEvents.TRACK_UNMUTED, (event) => {
        if (event.kind === 'audio') this.syncInputPause()
      }),
    )
  }

  get state(): VoiceTranslateState {
    return this.translator?.getState() ?? DISABLED_STATE
  }

  get isEnabled(): boolean {
    return this.translator !== null
  }

  // Включить перевод. Повторный вызов заменяет транспорт и параметры (сессия переоткрывается)
  enable = async (options: VoiceTranslateEnableOptions): Promise<void> => {
    const { pauseWhenMuted = true, ...translatorOptions } = options
    const { transport, targetLanguage } = translatorOptions
    if (!transport.info.languages.some((l) => l.code === targetLanguage)) {
      throw new Error(`Language "${targetLanguage}" is not supported by ${transport.info.id}`)
    }

    this.detachTranslator()
    this.pauseWhenMuted = pauseWhenMuted

    const translator = new VoiceTranslator(translatorOptions)
    this.translator = translator
    this.translatorUnsubs = ALL_EVENTS.map((type) =>
      translator.on(type, ((payload: unknown) => this.forward(type, payload)) as VoiceTranslateEventMap[typeof type]),
    )
    this.syncInputPause()

    const pipeline = this.mediaStreamService.getAudioProcessingPipeline()
    await pipeline.setProcessor(SLOT, translator)
    if (this.translator !== translator) return // пока ставили — выключили или включили заново

    this.notify(VoiceTranslateEvents.ENABLED, { providerId: transport.info.id, targetLanguage })
    this.notify(VoiceTranslateEvents.STATE_CHANGED, translator.getState())
    try {
      await this.mediaStreamService.engageAudioProcessing()
    } catch (error) {
      const failure: VoiceTranslateError = {
        reason: 'unknown',
        message: error instanceof Error ? error.message : String(error),
        providerId: transport.info.id,
      }
      this.notify(VoiceTranslateEvents.ERROR, failure)
      throw error
    }
  }

  // Выключить перевод: сессия закрывается, в граф возвращается исходный голос.
  // Дорожка не заменяется: граф микрофона остаётся включённым (как после setGain)
  disable = async (): Promise<void> => {
    if (!this.translator) return
    const translator = this.translator
    this.detachTranslator()
    const pipeline = this.mediaStreamService.getAudioProcessingPipeline()
    if (pipeline.getProcessor(SLOT) === translator) await pipeline.setProcessor(SLOT, null)
    else translator.destroy()
    this.notify(VoiceTranslateEvents.DISABLED, undefined)
    this.notify(VoiceTranslateEvents.STATE_CHANGED, DISABLED_STATE)
  }

  // Смена языка переподключает сессию
  setTargetLanguage = (targetLanguage: string): void => {
    const translator = this.requireTranslator()
    if (!translator.transport.info.languages.some((l) => l.code === targetLanguage)) {
      throw new Error(`Language "${targetLanguage}" is not supported by ${translator.transport.info.id}`)
    }
    translator.setTargetLanguage(targetLanguage)
  }

  setSameLanguageSpeech = (mode: SameLanguageSpeech): void => {
    this.requireTranslator().setSameLanguageSpeech(mode)
  }

  setOriginalVolume = (volume: number): void => {
    this.requireTranslator().setOriginalVolume(volume)
  }

  setErrorFallback = (fallback: VoiceTranslateErrorFallback): void => {
    this.requireTranslator().setErrorFallback(fallback)
  }

  // ── Подписки (сахар над on()) ──

  onStateChange = (callback: (state: VoiceTranslateState) => void): VoidFunction =>
    this.on(VoiceTranslateEvents.STATE_CHANGED, callback)

  onTranscript = (callback: (event: VoiceTranscriptEvent) => void): VoidFunction =>
    this.on(VoiceTranslateEvents.TRANSCRIPT, callback)

  onError = (callback: (error: VoiceTranslateError) => void): VoidFunction =>
    this.on(VoiceTranslateEvents.ERROR, callback)

  // Все события одним потоком: { type, payload }
  onAny = (callback: (event: VoiceTranslateAnyEvent) => void): VoidFunction => {
    this.anyListeners.add(callback)
    return () => this.anyListeners.delete(callback)
  }

  destroy(): void {
    const translator = this.translator
    this.detachTranslator()
    if (translator) {
      const pipeline = this.mediaStreamService.getAudioProcessingPipeline()
      if (pipeline.getProcessor(SLOT) === translator) void pipeline.setProcessor(SLOT, null)
      else translator.destroy()
    }
    this.mediaUnsubs.forEach((fn) => fn())
    this.mediaUnsubs = []
    this.anyListeners.clear()
    this.removeAllListeners()
  }

  // ── внутреннее ──

  private requireTranslator(): VoiceTranslator {
    if (!this.translator) throw new Error('Voice translation is disabled. Call voiceTranslateController.enable() first.')
    return this.translator
  }

  private detachTranslator(): void {
    this.translatorUnsubs.forEach((fn) => fn())
    this.translatorUnsubs = []
    this.translator = null
  }

  private syncInputPause(): void {
    if (!this.translator) return
    const { hasAudio, isAudioMuted } = this.mediaStreamService.getState()
    this.translator.setInputPaused(this.pauseWhenMuted && hasAudio && isAudioMuted)
  }

  private forward(type: VoiceTranslateEvents, payload: unknown): void {
    ;(this.notify as (t: VoiceTranslateEvents, p: unknown) => void)(type, payload)
  }

  private notify<K extends keyof VoiceTranslateEventMap>(type: K, payload: Parameters<VoiceTranslateEventMap[K]>[0]): void {
    ;(this.emit as (t: K, p: unknown) => boolean)(type, payload)
    const event = { type, payload } as VoiceTranslateAnyEvent
    this.anyListeners.forEach((cb) => cb(event))
  }
}
