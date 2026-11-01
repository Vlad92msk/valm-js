import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Valm } from 'valm-js'
import {
  VoiceTranslateEvents,
  GeminiLiveTranslateTransport,
  GEMINI_TRANSLATE_LANGUAGES,
  geminiTokenFromApiKey,
} from 'valm-js/voice-translate'
import type { SameLanguageSpeech, VoiceTranslateAnyEvent, VoiceTranslateState } from 'valm-js/voice-translate'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

// Прайс Gemini 3.5 Live Translate, платный уровень, $/мин (ai.google.dev/gemini-api/docs/pricing, 2026-11-01)
const PRICE_INPUT_PER_MIN = 0.0053
const PRICE_OUTPUT_PER_MIN = 0.0315

const API_KEY_URL = 'https://aistudio.google.com/apikey'

// Частые события в журнал не пишем — их видно по состоянию; сырые сообщения провайдера только считаем
const QUIET_EVENTS = new Set(['stateChanged', 'translatedAudio', 'usageChanged', 'latencyChanged', 'providerEvent', 'activityChanged'])
const LOG_LIMIT = 40

type AuthMode = 'api-key' | 'ephemeral-token'

interface LogEntry {
  id: number
  time: string
  type: string
  details: string
}

interface VoiceTranslateTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const formatMs = (value: number | null): string => (value === null ? '—' : `${(value / 1000).toFixed(2)} s`)

const describePayload = (event: VoiceTranslateAnyEvent): string => {
  switch (event.type) {
    case 'statusChanged':
      return `${event.payload.previous} → ${event.payload.status}${event.payload.error ? ` (${event.payload.error.reason})` : ''}`
    case 'transcript':
      return `${event.payload.kind}${event.payload.isFinal ? ' final' : event.payload.isInterim ? ' interim' : ''}: ${event.payload.isFinal ? event.payload.turnText : event.payload.text}`
    case 'error':
      return `${event.payload.reason}: ${event.payload.message}`
    case 'disabled':
    case 'interrupted':
      return ''
    default:
      return JSON.stringify(event.payload) ?? ''
  }
}

const VoiceTranslateTab = ({ media, onError }: VoiceTranslateTabProps) => {
  const { t, i18n } = useTranslation()
  const controller = media.voiceTranslateController
  const audioRef = useRef<HTMLAudioElement>(null)
  const logId = useRef(0)

  // Ключ — только в state этого компонента: не сохраняется
  const [apiKey, setApiKey] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('api-key')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [sameLanguage, setSameLanguage] = useState<SameLanguageSpeech>('pass')
  const [originalVolume, setOriginalVolume] = useState(0)
  // Перевод уходит в исходящую дорожку; чтобы его услышать, её надо проиграть — включено сразу (в наушниках)
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [state, setState] = useState<VoiceTranslateState>(controller.state)
  const [isMicEnabled, setIsMicEnabled] = useState(media.microphoneController.state.isEnabled)
  const [inputText, setInputText] = useState('')
  const [outputText, setOutputText] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [rawCount, setRawCount] = useState(0)

  useEffect(() => {
    const unsubs = [
      controller.onStateChange((s) => setState({ ...s, usage: { ...s.usage } })),
      controller.on(VoiceTranslateEvents.USAGE_CHANGED, (usage) => setState((prev) => ({ ...prev, usage }))),
      controller.onTranscript((event) => {
        if (event.isInterim || event.isFinal) return
        const append = (prev: string) => (prev + event.text).slice(-2000)
        if (event.kind === 'input') setInputText(append)
        else setOutputText(append)
      }),
      controller.onAny((event) => {
        if (event.type === 'providerEvent') {
          setRawCount((n) => n + 1)
          return
        }
        if (QUIET_EVENTS.has(event.type)) return
        const entry: LogEntry = {
          id: ++logId.current,
          time: new Date().toLocaleTimeString(),
          type: event.type,
          details: describePayload(event).slice(0, 200),
        }
        setLog((prev) => [entry, ...prev].slice(0, LOG_LIMIT))
      }),
      media.microphoneController.onStateChange((s) => setIsMicEnabled(s.isEnabled)),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [controller, media])

  // Выключить перевод при уходе со страницы (контроллер уничтожит и valm.destroy())
  useEffect(() => () => void controller.disable(), [controller])

  // Прослушивание исходящей дорожки: то, что valm отдал бы в звонок
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const attach = () => {
      const track = media.microphoneController.getTrack()
      audio.srcObject = isMonitoring && track ? new MediaStream([track]) : null
      if (isMonitoring && track) void audio.play().catch(() => {})
    }
    attach()
    const unsubs = [media.microphoneController.onTrackReplaced(attach), media.microphoneController.onStateChange(attach)]
    return () => {
      unsubs.forEach((fn) => fn())
      audio.srcObject = null
    }
  }, [media, isMonitoring])

  const languages = useMemo(() => {
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames([i18n.language], { type: 'language' })
    } catch {
      names = null
    }
    return GEMINI_TRANSLATE_LANGUAGES.map((l) => ({ code: l.code, label: `${names?.of(l.code) ?? l.name} · ${l.code}` })).sort((a, b) =>
      a.label.localeCompare(b.label, i18n.language),
    )
  }, [i18n.language])

  const showError = (e: unknown) => onError(e instanceof Error ? e.message : String(e))

  const handleToggle = async () => {
    onError(null)
    if (state.isEnabled) {
      await controller.disable()
      return
    }
    const key = apiKey.trim()
    if (!key) {
      onError(t('playground.voice.needKey'))
      return
    }
    setIsBusy(true)
    setInputText('')
    setOutputText('')
    try {
      if (!media.microphoneController.state.isEnabled) await media.microphoneController.enable()
      const transport = new GeminiLiveTranslateTransport({
        auth: authMode === 'api-key' ? { type: 'api-key', apiKey: key } : { type: 'ephemeral-token', getToken: geminiTokenFromApiKey(key) },
      })
      await controller.enable({ transport, targetLanguage, sameLanguageSpeech: sameLanguage, originalVolume })
    } catch (e) {
      showError(e)
    } finally {
      setIsBusy(false)
    }
  }

  const handleLanguage = (code: string) => {
    setTargetLanguage(code)
    if (state.isEnabled) controller.setTargetLanguage(code)
  }

  const handleSameLanguage = (mode: SameLanguageSpeech) => {
    setSameLanguage(mode)
    if (state.isEnabled) controller.setSameLanguageSpeech(mode)
  }

  const handleOriginalVolume = (value: number) => {
    setOriginalVolume(value)
    if (state.isEnabled) controller.setOriginalVolume(value)
  }

  const handleClearLog = () => {
    setLog([])
    setRawCount(0)
  }

  const cost = (state.usage.inputSeconds / 60) * PRICE_INPUT_PER_MIN + (state.usage.outputSeconds / 60) * PRICE_OUTPUT_PER_MIN
  const statusVariant = state.status === 'active' ? 'granted' : state.status === 'error' ? 'denied' : state.status === 'connecting' ? 'prompt' : 'unknown'

  return (
    <div className={cn('controls')}>
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>{t('playground.voice.title')}</h3>
        <p className={cn('controlHint')}>{t('playground.voice.lead')}</p>

        <label className={cn('field')}>
          <span className={cn('fieldLabel')}>
            {t('playground.voice.apiKey')} ·{' '}
            <a className={cn('fieldLink')} href={API_KEY_URL} target="_blank" rel="noreferrer">{t('playground.voice.getKey')}</a>
          </span>
          <input
            className={cn('textInput')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('playground.voice.apiKeyPlaceholder')}
            value={apiKey}
            disabled={state.isEnabled}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <span className={cn('fieldLabel')}>{t('playground.voice.apiKeyHint')}</span>
        </label>

        <HintRow label={t('playground.voice.auth')} hint={t('playground.voice.authHint')}>
          <select
            className={cn('deviceSelect', { compact: true })}
            value={authMode}
            disabled={state.isEnabled}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
          >
            <option value="api-key">{t('playground.voice.authKey')}</option>
            <option value="ephemeral-token">{t('playground.voice.authToken')}</option>
          </select>
        </HintRow>

        <HintRow label={t('playground.voice.enable')} hint={t('playground.voice.enableHint')}>
          <button
            type="button"
            aria-label={t('playground.voice.enable')}
            className={cn('controlToggle', { active: state.isEnabled, disabled: isBusy })}
            onClick={handleToggle}
            disabled={isBusy}
          />
        </HintRow>
        {!isMicEnabled && !state.isEnabled && <p className={cn('controlHint')}>{t('playground.voice.needMic')}</p>}
        <HintRow label={t('playground.voice.monitor')} hint={t('playground.voice.monitorHint')}>
          <button
            type="button"
            aria-label={t('playground.voice.monitor')}
            className={cn('controlToggle', { active: isMonitoring })}
            onClick={() => setIsMonitoring((v) => !v)}
          />
        </HintRow>
        {state.isEnabled && !isMonitoring && <p className={cn('controlHint')}>{t('playground.voice.monitorOff')}</p>}

        <HintRow label={t('playground.voice.language')} hint={t('playground.voice.languageHint')}>
          <select className={cn('deviceSelect', { compact: true })} value={targetLanguage} onChange={(e) => handleLanguage(e.target.value)}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </HintRow>

        <HintRow label={t('playground.voice.sameLanguage')} hint={t('playground.voice.sameLanguageHint')}>
          <select
            className={cn('deviceSelect', { compact: true })}
            value={sameLanguage}
            onChange={(e) => handleSameLanguage(e.target.value as SameLanguageSpeech)}
          >
            <option value="pass">{t('playground.voice.samePass')}</option>
            <option value="silence">{t('playground.voice.sameSilence')}</option>
          </select>
        </HintRow>

        <HintRow label={`${t('playground.voice.original')}: ${Math.round(originalVolume * 100)}%`} hint={t('playground.voice.originalHint')}>
          <input
            type="range"
            className={cn('rangeInput')}
            min={0}
            max={0.5}
            step={0.05}
            value={originalVolume}
            onChange={(e) => handleOriginalVolume(Number(e.target.value))}
          />
        </HintRow>

        <audio ref={audioRef} autoPlay />
      </div>

      <div className={cn('controlGroup')}>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.status')}</span>
          <span className={cn('badge', { variant: statusVariant })}>{t(`playground.voice.statuses.${state.status}`)}</span>
        </div>
        {state.error && (
          <p className={cn('controlHint')}>
            {t(`playground.voice.errors.${state.error.reason}`)}
            <br />
            <code>{state.error.code !== undefined ? `${state.error.code} · ` : ''}{state.error.message}</code>
          </p>
        )}
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.activity')}</span>
          <span className={cn('controlValue')}>{t(`playground.voice.activities.${state.activity}`)}</span>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.detected')}</span>
          <span className={cn('controlValue')}>{state.detectedLanguage ?? '—'}</span>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.latencyStart')}</span>
          <span className={cn('controlValue')}>
            {formatMs(state.latency.lastStartToFirstAudioMs)} · {t('playground.voice.average')} {formatMs(state.latency.avgStartToFirstAudioMs)}
          </span>
        </div>
        <HintRow label={t('playground.voice.latencyEnd')} hint={t('playground.voice.latencyEndHint')}>
          <span className={cn('controlValue')}>{formatMs(state.latency.lastEndToFirstAudioMs)}</span>
        </HintRow>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.latencyFinish')}</span>
          <span className={cn('controlValue')}>
            {formatMs(state.latency.lastEndToFinishMs)} · {t('playground.voice.average')} {formatMs(state.latency.avgEndToFinishMs)} ·{' '}
            {t('playground.voice.phrases')} {state.latency.samples}
          </span>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>{t('playground.voice.usage')}</span>
          <span className={cn('controlValue')}>
            {state.usage.inputSeconds.toFixed(0)} s / {state.usage.outputSeconds.toFixed(0)} s
          </span>
        </div>
        <p className={cn('fieldLabel')}>{t('playground.voice.cost', { cost: cost.toFixed(4) })}</p>
      </div>

      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>{t('playground.voice.transcriptInput')}</h3>
        <div className={cn('transcriptLog')}>
          <p className={cn('transcriptLine')}>{inputText || '—'}</p>
        </div>
        <h3 className={cn('controlGroupTitle')}>{t('playground.voice.transcriptOutput')}</h3>
        <div className={cn('transcriptLog')}>
          <p className={cn('transcriptLine')}>{outputText || '—'}</p>
        </div>
      </div>

      <div className={cn('controlGroup')}>
        <div className={cn('extraSectionHeader')}>
          <h3 className={cn('controlGroupTitle')}>{t('playground.voice.events')}</h3>
          <button type="button" className={cn('actionBtn', { small: true })} onClick={handleClearLog}>
            {t('playground.voice.clear')}
          </button>
        </div>
        <p className={cn('fieldLabel')}>
          {t('playground.voice.eventsHint')} {t('playground.voice.rawCount', { count: rawCount })}
        </p>
        <div className={cn('transcriptLog')}>
          {log.length === 0 && <p className={cn('transcriptLine', { interim: true })}>—</p>}
          {log.map((entry) => (
            <p key={entry.id} className={cn('transcriptLine')}>
              <code>{entry.time} {entry.type}</code> {entry.details}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default VoiceTranslateTab
