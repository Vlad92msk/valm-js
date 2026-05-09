import { useState, useEffect, useCallback } from 'react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

const LANGUAGES = [
  { code: 'ru-RU', label: 'Русский' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
]

interface TranscriptEntry {
  text: string
  timestamp: number
}

interface MoreTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const MoreTab = ({ media, onError }: MoreTabProps) => {
  // Transcription
  const [transcriptionActive, setTranscriptionActive] = useState(false)
  const [transcriptionSupported, setTranscriptionSupported] = useState(false)
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('en-US')
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')

  // Mic dependency
  const [micEnabled, setMicEnabled] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      media.microphoneController.onStateChange((state) => {
        setMicEnabled(state.isEnabled)
      }),
    )

    unsubs.push(
      media.transcriptionController.onStateChange((state) => {
        setTranscriptionActive(state.isActive)
        setTranscriptionSupported(state.isSupported)
        setTranscriptionLanguage(state.currentLanguage)
      }),
    )

    unsubs.push(
      media.transcriptionController.onTranscript((item) => {
        if (item.isFinal) {
          setTranscripts((prev) => [...prev, { text: item.text, timestamp: item.timestamp }])
          setInterimTranscript('')
        } else {
          setInterimTranscript(item.text)
        }
      }),
    )

    setTranscriptionSupported(media.transcriptionController.state.isSupported)

    return () => unsubs.forEach((fn) => fn())
  }, [media])

  const showError = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e))

  const handleToggleTranscription = useCallback(async () => {
    onError(null)
    try { await media.transcriptionController.toggle() } catch (e) { showError(e) }
  }, [media, onError])

  const handleTranscriptionLanguage = useCallback((lang: string) => {
    media.transcriptionController.updateLanguage(lang)
    setTranscriptionLanguage(lang)
  }, [media])

  const handleClearTranscripts = useCallback(() => {
    media.transcriptionController.clearTranscripts()
    setTranscripts([])
    setInterimTranscript('')
  }, [media])

  const handleExportConfig = useCallback(() => {
    const json = media.configurationController.exportConfig()
    if (json) {
      navigator.clipboard.writeText(json)
      onError(null)
    }
  }, [media, onError])

  const handleImportConfig = useCallback(async () => {
    onError(null)
    try {
      const json = await navigator.clipboard.readText()
      media.configurationController.importConfig(json)
    } catch (e) {
      showError(e)
    }
  }, [media, onError])

  const handleResetConfig = useCallback(() => {
    media.configurationController.resetAll()
  }, [media])

  return (
    <div className={cn('controls')}>
      {/* Transcription */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Transcription</h3>
        {!transcriptionSupported ? (
          <p className={cn('controlHint')}>Not supported in this browser</p>
        ) : (
          <>
            <HintRow label="Enable" hint="Включить распознавание речи в реальном времени. Требует включённого микрофона. Использует Web Speech API браузера">
              <button
                type="button"
                className={cn('controlToggle', { active: transcriptionActive, disabled: !micEnabled })}
                onClick={handleToggleTranscription}
                disabled={!micEnabled}
              />
            </HintRow>
            <HintRow label="Language" hint="Язык распознавания речи. Влияет на точность — выберите язык, на котором говорите">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={transcriptionLanguage}
                onChange={(e) => handleTranscriptionLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </HintRow>
          </>
        )}
      </div>

      {/* Transcript log */}
      {transcripts.length > 0 && (
        <div className={cn('controlGroup')}>
          <div className={cn('extraSectionHeader')}>
            <h3 className={cn('controlGroupTitle')}>Transcript Log</h3>
            <button type="button" className={cn('actionBtn', { small: true })} onClick={handleClearTranscripts}>
              Clear
            </button>
          </div>
          <div className={cn('transcriptLog')}>
            {transcripts.map((t, i) => (
              <p key={i} className={cn('transcriptLine')}>{t.text}</p>
            ))}
            {interimTranscript && (
              <p className={cn('transcriptLine', { interim: true })}>{interimTranscript}</p>
            )}
          </div>
        </div>
      )}

      {/* Config */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Configuration</h3>
        <div className={cn('controlRowActions')}>
          <button type="button" className={cn('actionBtn', { small: true })} onClick={handleExportConfig}>
            Copy JSON
          </button>
          <button type="button" className={cn('actionBtn', { small: true })} onClick={handleImportConfig}>
            Paste JSON
          </button>
          <button type="button" className={cn('actionBtn', { small: true, variant: 'danger' })} onClick={handleResetConfig}>
            Reset all
          </button>
        </div>
      </div>
    </div>
  )
}

export default MoreTab
