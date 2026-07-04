import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Circle, Square, Play, Pause } from 'lucide-react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'

const cn = makeCn('PlaygroundPage', styles)

const RECORDING_FORMATS = [
  { value: 'webm', label: 'WebM' },
  { value: 'mp4', label: 'MP4' },
]

const QUALITY_PRESETS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface RecordingTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const RecordingTab = ({ media, onError }: RecordingTabProps) => {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordingSize, setRecordingSize] = useState(0)
  const [recordingQuality, setRecordingQuality] = useState('medium')
  const [recordingFormat, setRecordingFormat] = useState('webm')
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null)

  // Dependencies from other controllers
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [micEnabled, setMicEnabled] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      media.cameraController.onStateChange((state) => {
        setCameraEnabled(state.isEnabled)
      }),
    )

    unsubs.push(
      media.microphoneController.onStateChange((state) => {
        setMicEnabled(state.isEnabled)
      }),
    )

    unsubs.push(
      media.recordingController.onStateChange((state) => {
        setIsRecording(state.isRecording)
        setIsPaused(state.isPaused)
        setRecordingDuration(state.duration)
        setRecordingSize(state.fileSize)
      }),
    )

    unsubs.push(
      media.recordingController.onRecordingStopped((blob, utils) => {
        setLastRecordingUrl(utils.createObjectURL(blob))
      }),
    )

    unsubs.push(
      media.recordingController.onError((err: unknown) =>
        onError(`recording: ${err instanceof Error ? err.message : String(err)}`),
      ),
    )

    const syncConfigToState = () => {
      const config = media.configurationController.getRecordingConfig()
      setRecordingQuality(config.quality)
      setRecordingFormat(config.format)
    }

    unsubs.push(media.configurationController.onImport(syncConfigToState))
    unsubs.push(media.configurationController.onReset(syncConfigToState))

    return () => unsubs.forEach((fn) => fn())
  }, [media, onError])

  // Recording duration timer
  useEffect(() => {
    if (!isRecording || isPaused) return
    const id = setInterval(() => {
      const state = media.recordingController.state
      if (state) {
        setRecordingDuration(state.duration)
        setRecordingSize(state.fileSize)
      }
    }, 500)
    return () => clearInterval(id)
  }, [media, isRecording, isPaused])

  const showError = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e))

  const handleStartRecording = useCallback(async () => {
    onError(null)
    setLastRecordingUrl(null)
    try {
      await media.recordingController.startRecording({
        quality: recordingQuality as 'low' | 'medium' | 'high',
        format: recordingFormat as 'webm' | 'mp4',
      })
    } catch (e) { showError(e) }
  }, [media, onError, recordingQuality, recordingFormat])

  const handleStopRecording = useCallback(async () => {
    try { await media.recordingController.stopRecording() } catch (e) { showError(e) }
  }, [media])

  const handlePauseRecording = useCallback(() => {
    if (isPaused) {
      media.recordingController.resumeRecording()
    } else {
      media.recordingController.pauseRecording()
    }
  }, [media, isPaused])

  const noSource = !isRecording && !cameraEnabled && !micEnabled
  const timerState = isRecording ? (isPaused ? 'paused' : 'active') : 'idle'
  const statusText = isRecording
    ? (isPaused ? t('playground.recording.paused') : t('playground.recording.active'))
    : t('playground.recording.ready')

  return (
    <div className={cn('controls')}>
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Recording</h3>

        {/* Big timer */}
        <div className={cn('recTimerBox')}>
          <div className={cn('recTime', { state: timerState })}>{formatDuration(recordingDuration)}</div>
          <div className={cn('recStatus')}>
            {statusText}
            {isRecording && ` · ${formatSize(recordingSize)}`}
          </div>
        </div>

        {/* Settings — locked while recording */}
        <div className={cn('field')}>
          <label className={cn('fieldLabel')}>Format</label>
          <select
            className={cn('deviceSelect')}
            value={recordingFormat}
            onChange={(e) => setRecordingFormat(e.target.value)}
            disabled={isRecording}
          >
            {RECORDING_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className={cn('field')}>
          <label className={cn('fieldLabel')}>Quality</label>
          <select
            className={cn('deviceSelect')}
            value={recordingQuality}
            onChange={(e) => setRecordingQuality(e.target.value)}
            disabled={isRecording}
          >
            {QUALITY_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Record / Stop + Pause */}
        <div className={cn('recActions')}>
          <button
            type="button"
            className={cn('actionBtn', isRecording ? { full: true } : { variant: 'danger', full: true })}
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={noSource}
          >
            {isRecording ? <Square size={18} /> : <Circle size={18} />}
            {isRecording ? t('playground.recording.stop') : t('playground.recording.record')}
          </button>
          <button
            type="button"
            className={cn('recPauseBtn')}
            onClick={handlePauseRecording}
            disabled={!isRecording}
            aria-label={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        </div>

        {noSource && (
          <p className={cn('recNote')}>{t('playground.recording.needSource')}</p>
        )}

        {lastRecordingUrl && (
          <>
            <a href={lastRecordingUrl} download={`recording.${recordingFormat}`} className={cn('actionBtn', { full: true })}>
              Download
            </a>
            <video src={lastRecordingUrl} className={cn('recordingPlayback')} controls />
          </>
        )}
      </div>
    </div>
  )
}

export default RecordingTab
