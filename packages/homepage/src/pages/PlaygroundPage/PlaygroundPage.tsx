import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Valm, EffectsPlugin, SegmentationProvider, FaceMeshProvider, DeviceDetector } from 'valm-js'

import { Tabs } from './elements/Tabs'
import DevicesTab from './elements/DevicesTab'
import ScreenShareTab from './elements/ScreenShareTab'
import RecordingTab from './elements/RecordingTab'
import EffectsTab from './elements/EffectsTab'
import MoreTab from './elements/MoreTab'
import styles from './PlaygroundPage.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('PlaygroundPage', styles)

interface SubtitleEntry {
  text: string
  timestamp: number
}

function createValm(): Valm {
  const isMobile = DeviceDetector.isMobile()
  const mlProviderOptions = { minInterval: isMobile ? 100 : 33, cacheEnabled: true }
  return new Valm().use(
    new EffectsPlugin({
      providers: {
        segmentation: new SegmentationProvider(mlProviderOptions),
        faceMesh: new FaceMeshProvider(mlProviderOptions),
      },
    }),
  )
}

const PlaygroundPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)

  const [media, setMedia] = useState<Valm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [screenShareActive, setScreenShareActive] = useState(false)
  const [activeVideoTab, setActiveVideoTab] = useState<'camera' | 'screen'>('camera')
  const [transcripts, setTranscripts] = useState<SubtitleEntry[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')

  useEffect(() => {
    const m = createValm()

    const unsubs = [
      m.cameraController.onStateChange((state) => {
        setCameraEnabled(state.isEnabled)
        if (videoRef.current) {
          videoRef.current.srcObject = state.isEnabled ? m.cameraController.getStream() : null
        }
      }),
      m.cameraController.onTrackReplaced(() => {
        if (videoRef.current && m.cameraController.state.isEnabled) {
          videoRef.current.srcObject = m.cameraController.getStream()
        }
      }),
      m.screenShareController.onStateChange((state) => {
        setScreenShareActive(state.isActive)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = state.isActive ? m.screenShareController.getStream() : null
        }
      }),
      m.transcriptionController.onTranscript((item) => {
        if (item.isFinal) {
          setTranscripts((prev) => [...prev, { text: item.text, timestamp: item.timestamp }])
          setInterimTranscript('')
        } else {
          setInterimTranscript(item.text)
        }
      }),
    ]

    setMedia(m)

    return () => {
      unsubs.forEach((fn) => fn())
      m.destroy()
    }
  }, [])

  useEffect(() => {
    if (!screenShareActive && activeVideoTab === 'screen') {
      setActiveVideoTab('camera')
    }
  }, [screenShareActive, activeVideoTab])

  // ── Computed ──

  const multipleVideos = cameraEnabled && screenShareActive
  const activeVideo = multipleVideos
    ? activeVideoTab
    : screenShareActive ? 'screen' : 'camera'

  const hasSubtitles = transcripts.length > 0 || interimTranscript

  // ── Control tabs ──

  const controlTabs = media
    ? [
        { id: 'devices', label: 'Devices', content: <DevicesTab media={media} onError={setError} /> },
        { id: 'screen', label: 'Screen', content: <ScreenShareTab media={media} onError={setError} /> },
        { id: 'recording', label: 'Recording', content: <RecordingTab media={media} onError={setError} /> },
        { id: 'effects', label: 'Effects', content: <EffectsTab media={media} onError={setError} /> },
        { id: 'more', label: 'More', content: <MoreTab media={media} onError={setError} /> },
      ]
    : []

  return (
    <div className={cn()}>
      <div className={cn('topbar')}>
        <Link to="/" className={cn('homeLink')}>← Home</Link>
        <span className={cn('pageTitle')}>Playground</span>
      </div>
      {error && (
        <div className={cn('error')}>
          <span>{error}</span>
          <button type="button" className={cn('errorClose')} onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className={cn('layout')}>
        {/* ── Video area ── */}
        <div className={cn('previewColumn')}>
          {/* Video tabs — only when multiple sources active */}
          {multipleVideos && (
            <div className={cn('tabBar', { compact: true })}>
              <button
                type="button"
                className={cn('tab', { active: activeVideoTab === 'camera' })}
                onClick={() => setActiveVideoTab('camera')}
              >
                Camera
              </button>
              <button
                type="button"
                className={cn('tab', { active: activeVideoTab === 'screen' })}
                onClick={() => setActiveVideoTab('screen')}
              >
                Screen
              </button>
            </div>
          )}

          {/* Camera preview — always mounted */}
          <section className={cn('preview', { hidden: activeVideo !== 'camera' })}>
            <video
              ref={videoRef}
              className={cn('video', { hidden: !cameraEnabled, mirrored: cameraEnabled })}
              autoPlay
              playsInline
              muted
            />
            {!cameraEnabled && activeVideo === 'camera' && (
              <div className={cn('previewPlaceholder')}>
                <span className={cn('previewIcon')}>📹</span>
                <p className={cn('previewLabel')}>Enable camera to see preview</p>
              </div>
            )}
          </section>

          {/* Screen share preview — always mounted */}
          <section className={cn('preview', { hidden: activeVideo !== 'screen' })}>
            <video
              ref={screenVideoRef}
              className={cn('video', { hidden: !screenShareActive })}
              autoPlay
              playsInline
              muted
            />
          </section>

          {/* Subtitles under video */}
          {hasSubtitles && (
            <div className={cn('subtitles')}>
              {transcripts.slice(-3).map((t, i) => (
                <span key={i} className={cn('subtitleLine')}>{t.text} </span>
              ))}
              {interimTranscript && (
                <span className={cn('subtitleLine', { interim: true })}>{interimTranscript}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Controls area ── */}
        <div className={cn('controlsWrapper')}>
          {controlTabs.length > 0 && <Tabs tabs={controlTabs} />}
        </div>
      </div>
    </div>
  )
}

export default PlaygroundPage
