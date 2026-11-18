import { useState, useEffect, useRef, useCallback } from 'react'
import type { Valm } from 'valm-js'
import { PcmCapture } from 'valm-js/pcm-capture'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

const RATES = [16000, 24000]
const CHUNKS_MS = [100, 250]

interface CaptureStats {
  chunks: number
  samples: number
  rms: number
}

interface PcmCaptureSectionProps {
  media: Valm
  onError: (error: string | null) => void
}

// valm-js/pcm-capture на треке микрофона: чанки PCM16 только считаются, никуда не уходят
const PcmCaptureSection = ({ media, onError }: PcmCaptureSectionProps) => {
  const ctxRef = useRef<AudioContext | null>(null)
  const captureRef = useRef<PcmCapture | null>(null)
  const [micEnabled, setMicEnabled] = useState(media.microphoneController.state.isEnabled)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [sampleRate, setSampleRate] = useState(16000)
  const [chunkMs, setChunkMs] = useState(100)
  const [stats, setStats] = useState<CaptureStats>({ chunks: 0, samples: 0, rms: 0 })

  const stop = useCallback(() => {
    captureRef.current?.dispose()
    captureRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
    setIsActive(false)
    setIsPaused(false)
  }, [])

  useEffect(() => {
    const off = media.microphoneController.onStateChange((state) => {
      setMicEnabled(state.isEnabled)
      if (!state.isEnabled) stop()
    })
    return () => {
      off()
      stop()
    }
  }, [media, stop])

  const handleToggle = useCallback(async () => {
    onError(null)
    if (captureRef.current) {
      stop()
      return
    }
    const track = media.microphoneController.getTrack()
    if (!track) return
    try {
      const ctx = new AudioContext()
      ctxRef.current = ctx
      await ctx.resume()
      const capture = await PcmCapture.create(ctx, { sampleRate, chunkMs })
      ctx.createMediaStreamSource(new MediaStream([track])).connect(capture.node)
      capture.onChunk(({ pcm, rms }) => setStats((s) => ({ chunks: s.chunks + 1, samples: pcm.length, rms })))
      captureRef.current = capture
      setStats({ chunks: 0, samples: 0, rms: 0 })
      setIsActive(true)
    } catch (e) {
      stop()
      onError(e instanceof Error ? e.message : String(e))
    }
  }, [media, onError, sampleRate, chunkMs, stop])

  const handlePause = useCallback(() => {
    const capture = captureRef.current
    if (!capture) return
    capture.setPaused(!capture.isPaused)
    setIsPaused(capture.isPaused)
  }, [])

  return (
    <div className={cn('controlGroup')}>
      <h3 className={cn('controlGroupTitle')}>PCM Capture</h3>
      <HintRow label="Capture mic" hint="valm-js/pcm-capture: звук микрофона → PCM16 моно чанками с RMS, как для сервисов потокового распознавания. Чанки только считаются здесь, никуда не отправляются">
        <button
          type="button"
          className={cn('controlToggle', { active: isActive, disabled: !micEnabled })}
          onClick={handleToggle}
          disabled={!micEnabled}
        />
      </HintRow>
      <HintRow label="Sample rate" hint="Частота выхода. Меняется при следующем включении">
        <select
          className={cn('deviceSelect', { compact: true })}
          value={sampleRate}
          disabled={isActive}
          onChange={(e) => setSampleRate(Number(e.target.value))}
        >
          {RATES.map((r) => (
            <option key={r} value={r}>{r / 1000} kHz</option>
          ))}
        </select>
      </HintRow>
      <HintRow label="Chunk" hint="Длина чанка. Меняется при следующем включении">
        <select
          className={cn('deviceSelect', { compact: true })}
          value={chunkMs}
          disabled={isActive}
          onChange={(e) => setChunkMs(Number(e.target.value))}
        >
          {CHUNKS_MS.map((ms) => (
            <option key={ms} value={ms}>{ms} ms</option>
          ))}
        </select>
      </HintRow>
      <HintRow label="Pause" hint="setPaused(): на паузе чанки не идут и ничего не копится">
        <button
          type="button"
          className={cn('controlToggle', { active: isPaused, disabled: !isActive })}
          onClick={handlePause}
          disabled={!isActive}
        />
      </HintRow>
      {!micEnabled && <p className={cn('controlHint')}>Enable the microphone first</p>}
      {isActive && (
        <>
          <div className={cn('controlRow')}>
            <span className={cn('controlLabel')}>Chunks</span>
            <span className={cn('controlValue')}>{stats.chunks} × {stats.samples} samples</span>
          </div>
          <div className={cn('controlRow')}>
            <span className={cn('controlLabel')}>RMS</span>
            <span className={cn('controlValue')}>{stats.rms.toFixed(3)}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default PcmCaptureSection
