import { useState, useEffect, useCallback } from 'react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

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

  return (
    <div className={cn('controls')}>
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Recording</h3>
        {!isRecording ? (
          <>
            <HintRow label="Format" hint="Формат файла записи. WebM — кодек VP9/VP8 (лучшая поддержка в браузерах). MP4 — кодек H.264 (универсальная совместимость)">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={recordingFormat}
                onChange={(e) => setRecordingFormat(e.target.value)}
              >
                {RECORDING_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </HintRow>
            <HintRow label="Quality" hint="Качество записи. Low — 1 Мбит/с видео + 64 кбит/с аудио. Medium — 2.5 Мбит/с + 128 кбит/с. High — 5 Мбит/с + 256 кбит/с">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={recordingQuality}
                onChange={(e) => setRecordingQuality(e.target.value)}
              >
                {QUALITY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </HintRow>
            <div className={cn('controlRow')}>
              <button
                type="button"
                className={cn('actionBtn', { variant: 'primary' })}
                onClick={handleStartRecording}
                disabled={!cameraEnabled && !micEnabled}
              >
                Start recording
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Duration</span>
              <span className={cn('controlValue')}>{formatDuration(recordingDuration)}</span>
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Size</span>
              <span className={cn('controlValue')}>{formatSize(recordingSize)}</span>
            </div>
            <div className={cn('controlRowActions')}>
              <button type="button" className={cn('actionBtn')} onClick={handlePauseRecording}>
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className={cn('actionBtn', { variant: 'danger' })} onClick={handleStopRecording}>
                Stop
              </button>
            </div>
          </>
        )}
        {lastRecordingUrl && (
          <>
            <div className={cn('controlRow')}>
              <a href={lastRecordingUrl} download={`recording.${recordingFormat}`} className={cn('actionBtn')}>
                Download
              </a>
            </div>
            <video src={lastRecordingUrl} className={cn('recordingPlayback')} controls />
          </>
        )}
      </div>
    </div>
  )
}

export default RecordingTab
