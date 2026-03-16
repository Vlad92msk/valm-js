import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Valm, EffectsPlugin, SegmentationProvider, FaceMeshProvider, DeviceDetector, RecordingConfiguration } from 'valm-js'

import { Tabs } from './elements/Tabs'
import styles from './PlaygroundPage.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('PlaygroundPage', styles)

const LANGUAGES = [
  { code: 'ru-RU', label: 'Русский' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
]

const RESOLUTIONS = [
  { label: '480p', width: 640, height: 480 },
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
]

const FRAME_RATES = [15, 24, 30, 60]

const DISPLAY_SURFACES = [
  { value: 'monitor', label: 'Monitor' },
  { value: 'window', label: 'Window' },
  { value: 'application', label: 'Application' },
]

const CONTENT_HINTS = [
  { value: '', label: 'Auto' },
  { value: 'motion', label: 'Motion' },
  { value: 'detail', label: 'Detail' },
  { value: 'text', label: 'Text' },
]

const RECORDING_FORMATS = [
  { value: 'webm', label: 'WebM' },
  { value: 'mp4', label: 'MP4' },
]

const QUALITY_PRESETS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const BG_FIT_MODES = [
  { value: 'COVER', label: 'Cover' },
  { value: 'CONTAIN', label: 'Contain' },
  { value: 'STRETCH', label: 'Stretch' },
  { value: 'TILE', label: 'Tile' },
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

interface TranscriptEntry {
  text: string
  timestamp: number
}

const PlaygroundPage = () => {
  const mediaRef = useRef<Valm | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenVideoRef = useRef<HTMLVideoElement>(null)

  // Camera
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState('')

  // Microphone
  const [micEnabled, setMicEnabled] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [volume, setVolume] = useState(0)
  const [selectedMic, setSelectedMic] = useState('')

  // Audio processing
  const [echoCancellation, setEchoCancellation] = useState(true)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [autoGainControl, setAutoGainControl] = useState(true)

  // Screen share
  const [screenShareActive, setScreenShareActive] = useState(false)

  // Devices
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [selectedSpeaker, setSelectedSpeaker] = useState('')

  // Video config
  const [resolution, setResolution] = useState('1280x720')
  const [frameRate, setFrameRate] = useState(30)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Screen share config
  const [displaySurface, setDisplaySurface] = useState('monitor')
  const [includeAudio, setIncludeAudio] = useState(false)
  const [contentHint, setContentHint] = useState('')

  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordingSize, setRecordingSize] = useState(0)
  const [recordingQuality, setRecordingQuality] = useState('medium')
  const [recordingFormat, setRecordingFormat] = useState('webm')
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null)

  // Transcription
  const [transcriptionActive, setTranscriptionActive] = useState(false)
  const [transcriptionSupported, setTranscriptionSupported] = useState(false)
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('en-US')
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [interimTranscript, setInterimTranscript] = useState('')

  // Effects
  const [blurEnabled, setBlurEnabled] = useState(false)
  const [blurIntensity, setBlurIntensity] = useState(0.5)
  const [blurMode, setBlurMode] = useState<'BACKGROUND' | 'FOREGROUND'>('BACKGROUND')
  const [vbEnabled, setVbEnabled] = useState(false)
  const [vbColor, setVbColor] = useState('#00AA00')
  const [vbImageUrl, setVbImageUrl] = useState('')
  const [vbFitMode, setVbFitMode] = useState('COVER')

  // Permissions
  const [permissions, setPermissions] = useState<{ camera: string; microphone: string }>({
    camera: 'unknown',
    microphone: 'unknown',
  })

  // Pipeline debug
  const [pipelineState, setPipelineState] = useState<{ isRunning: boolean; fps: number; effects: string[] } | null>(null)
  const [cameraSettings, setCameraSettings] = useState<{ width: number; height: number; frameRate: number } | null>(null)

  // General
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // Video tabs
  const [activeVideoTab, setActiveVideoTab] = useState<'camera' | 'screen'>('camera')

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))

  // ── Initialize ──
  useEffect(() => {
    const media = new Valm()
    mediaRef.current = media

    const isMobile = DeviceDetector.isMobile()
    const mlProviderOptions = { minInterval: isMobile ? 100 : 33, cacheEnabled: true }
    media.use(new EffectsPlugin({
      providers: {
        segmentation: new SegmentationProvider({
          ...mlProviderOptions,
          config: { delegate: isMobile ? 'CPU' : 'GPU' },
        }),
        faceMesh: new FaceMeshProvider(mlProviderOptions),
      },
    }))

    const unsubs: Array<() => void> = []

    // Devices
    unsubs.push(
      media.devicesController.onChange((devices) => {
        setCameras(devices.cameras)
        setMicrophones(devices.microphones)
        setSpeakers(devices.speakers)
      }),
    )

    // Camera
    unsubs.push(
      media.cameraController.onStateChange((state) => {
        setCameraEnabled(state.isEnabled)
        if (state.deviceId) setSelectedCamera(state.deviceId)
        if (state.settings) {
          setCameraSettings({
            width: state.settings.width ?? 0,
            height: state.settings.height ?? 0,
            frameRate: state.settings.frameRate ?? 0,
          })
        } else {
          setCameraSettings(null)
        }
      }),
    )
    unsubs.push(
      media.cameraController.onTrackReplaced(() => {
        if (videoRef.current && media.cameraController.state.isEnabled) {
          videoRef.current.srcObject = media.cameraController.getStream()
        }
      }),
    )

    // Microphone
    unsubs.push(
      media.microphoneController.onStateChange((state) => {
        setMicEnabled(state.isEnabled)
        setMicMuted(state.isMuted)
        if (state.deviceId) setSelectedMic(state.deviceId)
      }),
    )
    unsubs.push(
      media.microphoneController.onVolumeChange(({ volume: v }) => setVolume(v)),
    )

    // Screen share
    unsubs.push(
      media.screenShareController.onStateChange((state) => {
        setScreenShareActive(state.isActive)
      }),
    )

    // Recording
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

    // Transcription
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

    // Effects
    unsubs.push(
      media.effectsController.onStateChange((state) => {
        setBlurEnabled(state.blur.isEnabled)
        setBlurIntensity(state.blur.intensity)
        setVbEnabled(state.virtualBackground.isEnabled)
        setPipelineState({
          isRunning: state.isProcessingEnabled,
          fps: state.currentFps,
          effects: state.activeEffects,
        })
      }),
    )

    // Errors
    const handleMediaError = (event: { source: string; action?: string; error: unknown }) =>
      setError(`${event.source}: ${event.error instanceof Error ? event.error.message : String(event.error)}`)
    unsubs.push(media.cameraController.onError(handleMediaError))
    unsubs.push(media.microphoneController.onError(handleMediaError))
    unsubs.push(media.screenShareController.onError(handleMediaError))
    unsubs.push(media.effectsController.onError(handleMediaError))
    unsubs.push(
      media.recordingController.onError((err: any) =>
        setError(`recording: ${err instanceof Error ? err.message : String(err)}`),
      ),
    )

    setTranscriptionSupported(media.transcriptionController.state.isSupported)

    // Load devices & check permissions
    media.devicesController.getAvailable().then((devices) => {
      setCameras(devices.cameras)
      setMicrophones(devices.microphones)
      setSpeakers(devices.speakers)
    })
    media.devicesController.checkPermissions().then(setPermissions)

    return () => {
      unsubs.forEach((fn) => fn())
      media.destroy()
    }
  }, [])

  // Sync camera video
  useEffect(() => {
    const media = mediaRef.current
    if (!videoRef.current || !media) return
    if (cameraEnabled) {
      const stream = media.cameraController.getStream()
      if (stream) videoRef.current.srcObject = stream
    } else {
      videoRef.current.srcObject = null
    }
  }, [cameraEnabled])

  // Sync screen share video
  useEffect(() => {
    const media = mediaRef.current
    if (!screenVideoRef.current || !media) return
    if (screenShareActive) {
      const stream = media.screenShareController.getStream()
      if (stream) screenVideoRef.current.srcObject = stream
    } else {
      screenVideoRef.current.srcObject = null
    }
  }, [screenShareActive])

  // Recording duration timer
  useEffect(() => {
    if (!isRecording || isPaused) return
    const id = setInterval(() => {
      const state = mediaRef.current?.recordingController.state
      if (state) {
        setRecordingDuration(state.duration)
        setRecordingSize(state.fileSize)
      }
    }, 500)
    return () => clearInterval(id)
  }, [isRecording, isPaused])

  // Auto-switch video tab when screen share stops
  useEffect(() => {
    if (!screenShareActive && activeVideoTab === 'screen') {
      setActiveVideoTab('camera')
    }
  }, [screenShareActive, activeVideoTab])

  // ── Handlers ──

  const showError = (e: any) => setError(e instanceof Error ? e.message : String(e))

  const requestPermissions = useCallback(async () => {
    const media = mediaRef.current
    if (!media) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getTracks().forEach((t) => t.stop())
      const p = await media.devicesController.checkPermissions()
      setPermissions(p)
      const devices = await media.devicesController.getAvailable()
      setCameras(devices.cameras)
      setMicrophones(devices.microphones)
      setSpeakers(devices.speakers)
    } catch (e) { showError(e) }
  }, [])

  const handleResolution = useCallback((val: string) => {
    setResolution(val)
    const [w, h] = val.split('x').map(Number)
    mediaRef.current?.configurationController.setVideoResolution(w, h)
  }, [])

  const handleFrameRate = useCallback((val: number) => {
    setFrameRate(val)
    mediaRef.current?.configurationController.setVideoFrameRate(val)
  }, [])

  const handleFacingMode = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    mediaRef.current?.configurationController.updateVideoConfig({ facingMode: next })
  }, [facingMode])

  const handleDisplaySurface = useCallback((val: string) => {
    setDisplaySurface(val)
    mediaRef.current?.screenShareController.updateDisplaySurface(val as 'monitor' | 'window' | 'application')
  }, [])

  const handleIncludeAudio = useCallback(() => {
    const next = !includeAudio
    setIncludeAudio(next)
    mediaRef.current?.screenShareController.updateAudioIncluded(next)
  }, [includeAudio])

  const handleContentHint = useCallback((val: string) => {
    setContentHint(val)
    mediaRef.current?.screenShareController.updateContentHint(val as '' | 'motion' | 'detail' | 'text')
  }, [])

  const toggleCamera = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.cameraController.toggle() } catch (e) { showError(e) }
  }, [])

  const handleCameraChange = useCallback(async (deviceId: string) => {
    setError(null)
    try { await mediaRef.current?.cameraController.switchDevice(deviceId) } catch (e) { showError(e) }
  }, [])

  const handleToggleFacing = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.cameraController.toggleFacing() } catch (e) { showError(e) }
  }, [])

  const toggleMic = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.microphoneController.toggle() } catch (e) { showError(e) }
  }, [])

  const toggleMicMute = useCallback(async () => {
    await mediaRef.current?.microphoneController.toggleMute()
  }, [])

  const handleMicChange = useCallback(async (deviceId: string) => {
    setError(null)
    try { await mediaRef.current?.microphoneController.switchDevice(deviceId) } catch (e) { showError(e) }
  }, [])

  const handleAudioProcessing = useCallback((key: string, value: boolean) => {
    const next = { echoCancellation, noiseSuppression, autoGainControl, [key]: value }
    if (key === 'echoCancellation') setEchoCancellation(value)
    if (key === 'noiseSuppression') setNoiseSuppression(value)
    if (key === 'autoGainControl') setAutoGainControl(value)
    mediaRef.current?.microphoneController.updateAudioProcessing(next)
  }, [echoCancellation, noiseSuppression, autoGainControl])

  const handleSpeakerChange = useCallback(async (deviceId: string) => {
    setError(null)
    try {
      await mediaRef.current?.audioOutputController.setOutputDevice(deviceId)
      setSelectedSpeaker(deviceId)
    } catch (e) { showError(e) }
  }, [])

  const handleTestSound = useCallback(async () => {
    try { await mediaRef.current?.audioOutputController.playTestSound() } catch (e) { showError(e) }
  }, [])

  const toggleScreenShare = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.screenShareController.toggle() } catch (e) { showError(e) }
  }, [])

  const handleToggleBlur = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.effectsController.toggleBlur() } catch (e) { showError(e) }
  }, [])

  const handleBlurIntensity = useCallback((val: number) => {
    setBlurIntensity(val)
    mediaRef.current?.effectsController.setBlurIntensity(val)
  }, [])

  const handleBlurMode = useCallback((mode: 'BACKGROUND' | 'FOREGROUND') => {
    setBlurMode(mode)
    mediaRef.current?.effectsController.setBlurMode(mode as any)
  }, [])

  const handleToggleVb = useCallback(async () => {
    setError(null)
    try {
      if (vbEnabled) {
        mediaRef.current?.effectsController.removeVirtualBackground()
      } else if (vbImageUrl) {
        await mediaRef.current?.effectsController.setVirtualBackground(vbImageUrl)
      } else {
        await mediaRef.current?.effectsController.setVirtualBackgroundColor(vbColor)
      }
    } catch (e) { showError(e) }
  }, [vbEnabled, vbImageUrl, vbColor])

  const handleVbColor = useCallback(async (color: string) => {
    setVbColor(color)
    if (vbEnabled) {
      try { await mediaRef.current?.effectsController.setVirtualBackgroundColor(color) } catch (e) { showError(e) }
    }
  }, [vbEnabled])

  const handleVbImageUrl = useCallback(async (url: string) => {
    setVbImageUrl(url)
    if (vbEnabled && url) {
      try { await mediaRef.current?.effectsController.setVirtualBackground(url) } catch (e) { showError(e) }
    }
  }, [vbEnabled])

  const handleVbFitMode = useCallback((mode: string) => {
    setVbFitMode(mode)
    mediaRef.current?.effectsController.setVirtualBackgroundFitMode(mode as any)
  }, [])

  const handleStartRecording = useCallback(async () => {
    setError(null)
    setLastRecordingUrl(null)
    try {
      await mediaRef.current?.recordingController.startRecording({
        quality: recordingQuality as 'low' | 'medium' | 'high',
        format: recordingFormat as 'webm' | 'mp4',
      })
    } catch (e) { showError(e) }
  }, [recordingQuality, recordingFormat])

  const handleStopRecording = useCallback(async () => {
    try { await mediaRef.current?.recordingController.stopRecording() } catch (e) { showError(e) }
  }, [])

  const handlePauseRecording = useCallback(() => {
    if (isPaused) {
      mediaRef.current?.recordingController.resumeRecording()
    } else {
      mediaRef.current?.recordingController.pauseRecording()
    }
  }, [isPaused])

  const handleToggleTranscription = useCallback(async () => {
    setError(null)
    try { await mediaRef.current?.transcriptionController.toggle() } catch (e) { showError(e) }
  }, [])

  const handleTranscriptionLanguage = useCallback((lang: string) => {
    mediaRef.current?.transcriptionController.updateLanguage(lang)
    setTranscriptionLanguage(lang)
  }, [])

  const handleClearTranscripts = useCallback(() => {
    mediaRef.current?.transcriptionController.clearTranscripts()
    setTranscripts([])
    setInterimTranscript('')
  }, [])

  const handleExportConfig = useCallback(() => {
    const json = mediaRef.current?.configurationController.exportConfig()
    if (json) {
      navigator.clipboard.writeText(json)
      setError(null)
    }
  }, [])

  const handleResetConfig = useCallback(() => {
    mediaRef.current?.configurationController.resetAll()
    setResolution('1280x720')
    setFrameRate(30)
    setFacingMode('user')
    setEchoCancellation(true)
    setNoiseSuppression(true)
    setAutoGainControl(true)
    setDisplaySurface('monitor')
    setIncludeAudio(false)
    setContentHint('')
    setRecordingQuality('medium')
    setRecordingFormat('webm')
  }, [])

  // ── Computed ──

  const multipleVideos = cameraEnabled && screenShareActive
  const activeVideo = multipleVideos
    ? activeVideoTab
    : screenShareActive ? 'screen' : 'camera'

  const hasSubtitles = transcripts.length > 0 || interimTranscript

  // ── Control tabs ──

  const devicesTab = (
    <div className={cn('controls')}>
      {/* Permissions */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Permissions</h3>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Camera</span>
          <span className={cn('badge', { variant: permissions.camera })}>{permissions.camera}</span>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Microphone</span>
          <span className={cn('badge', { variant: permissions.microphone })}>{permissions.microphone}</span>
        </div>
        <div className={cn('controlRowActions')}>
          <button type="button" className={cn('actionBtn')} onClick={requestPermissions}>
            Request permissions
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Camera</h3>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Enable</span>
          <button type="button" className={cn('controlToggle', { active: cameraEnabled })} onClick={toggleCamera} />
        </div>
        {cameras.length > 0 && (
          <div className={cn('controlRow')}>
            <select
              className={cn('deviceSelect')}
              value={selectedCamera}
              onChange={(e) => handleCameraChange(e.target.value)}
              disabled={!cameraEnabled}
            >
              {cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
        {cameraEnabled && (
          <div className={cn('controlRow')}>
            <button type="button" className={cn('actionBtn')} onClick={handleToggleFacing}>
              Flip camera
            </button>
          </div>
        )}
        {cameraSettings && (
          <div className={cn('controlRow')}>
            <span className={cn('controlLabel')}>Actual</span>
            <span className={cn('controlValue')}>
              {cameraSettings.width}×{cameraSettings.height} @ {Math.round(cameraSettings.frameRate)}fps
            </span>
          </div>
        )}
      </div>

      {/* Microphone */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Microphone</h3>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Enable</span>
          <button type="button" className={cn('controlToggle', { active: micEnabled })} onClick={toggleMic} />
        </div>
        {micEnabled && (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Mute</span>
              <button type="button" className={cn('controlToggle', { active: micMuted })} onClick={toggleMicMute} />
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Volume</span>
              <div className={cn('volumeBar')}>
                <div className={cn('volumeLevel')} style={{ width: `${volume}%` }} />
              </div>
            </div>
          </>
        )}
        {microphones.length > 0 && (
          <div className={cn('controlRow')}>
            <select
              className={cn('deviceSelect')}
              value={selectedMic}
              onChange={(e) => handleMicChange(e.target.value)}
              disabled={!micEnabled}
            >
              {microphones.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
        {micEnabled && (
          <>
            <button type="button" className={cn('sectionToggle', { nested: true })} onClick={() => toggleSection('audioProcessing')}>
              <span className={cn('controlLabel')}>Audio processing</span>
              <span className={cn('sectionArrow', { open: expandedSections.audioProcessing })}>▸</span>
            </button>
            {expandedSections.audioProcessing && (
              <>
                <div className={cn('controlRow')}>
                  <span className={cn('controlLabel')}>Echo cancel</span>
                  <button
                    type="button"
                    className={cn('controlToggle', { active: echoCancellation })}
                    onClick={() => handleAudioProcessing('echoCancellation', !echoCancellation)}
                  />
                </div>
                <div className={cn('controlRow')}>
                  <span className={cn('controlLabel')}>Noise suppression</span>
                  <button
                    type="button"
                    className={cn('controlToggle', { active: noiseSuppression })}
                    onClick={() => handleAudioProcessing('noiseSuppression', !noiseSuppression)}
                  />
                </div>
                <div className={cn('controlRow')}>
                  <span className={cn('controlLabel')}>Auto gain</span>
                  <button
                    type="button"
                    className={cn('controlToggle', { active: autoGainControl })}
                    onClick={() => handleAudioProcessing('autoGainControl', !autoGainControl)}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Audio Output */}
      {speakers.length > 0 && (
        <div className={cn('controlGroup')}>
          <h3 className={cn('controlGroupTitle')}>Audio Output</h3>
          <div className={cn('controlRow')}>
            <select
              className={cn('deviceSelect')}
              value={selectedSpeaker}
              onChange={(e) => handleSpeakerChange(e.target.value)}
            >
              {speakers.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
          <div className={cn('controlRow')}>
            <button type="button" className={cn('actionBtn')} onClick={handleTestSound}>
              Test sound
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const captureTab = (
    <div className={cn('controls')}>
      {/* Video Settings */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Video Settings</h3>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Resolution</span>
          <select
            className={cn('deviceSelect', { compact: true })}
            value={resolution}
            onChange={(e) => handleResolution(e.target.value)}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Frame rate</span>
          <select
            className={cn('deviceSelect', { compact: true })}
            value={frameRate}
            onChange={(e) => handleFrameRate(Number(e.target.value))}
          >
            {FRAME_RATES.map((f) => (
              <option key={f} value={f}>{f} fps</option>
            ))}
          </select>
        </div>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Facing: {facingMode}</span>
          <button type="button" className={cn('actionBtn', { small: true })} onClick={handleFacingMode}>
            Switch
          </button>
        </div>
      </div>

      {/* Screen Share */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Screen Share</h3>
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Share</span>
          <button type="button" className={cn('controlToggle', { active: screenShareActive })} onClick={toggleScreenShare} />
        </div>
        <button type="button" className={cn('sectionToggle', { nested: true })} onClick={() => toggleSection('screenShareSettings')}>
          <span className={cn('controlLabel')}>Settings</span>
          <span className={cn('sectionArrow', { open: expandedSections.screenShareSettings })}>▸</span>
        </button>
        {expandedSections.screenShareSettings && (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Surface</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={displaySurface}
                onChange={(e) => handleDisplaySurface(e.target.value)}
              >
                {DISPLAY_SURFACES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Include audio</span>
              <button
                type="button"
                className={cn('controlToggle', { active: includeAudio })}
                onClick={handleIncludeAudio}
              />
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Content hint</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={contentHint}
                onChange={(e) => handleContentHint(e.target.value)}
              >
                {CONTENT_HINTS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Recording */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Recording</h3>
        {!isRecording ? (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Format</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={recordingFormat}
                onChange={(e) => setRecordingFormat(e.target.value)}
              >
                {RECORDING_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Quality</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={recordingQuality}
                onChange={(e) => setRecordingQuality(e.target.value)}
              >
                {QUALITY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
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

  const effectsTab = (
    <div className={cn('controls')}>
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Effects</h3>
        {pipelineState && (
          <div className={cn('controlRow')}>
            <span className={cn('controlLabel')}>
              Pipeline: {pipelineState.isRunning ? 'running' : 'stopped'}
            </span>
            <span className={cn('controlValue')}>
              {pipelineState.fps > 0 ? `${Math.round(pipelineState.fps)} fps` : ''}
              {pipelineState.effects.length > 0 ? ` [${pipelineState.effects.join(', ')}]` : ''}
            </span>
          </div>
        )}

        {/* Blur */}
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Background blur</span>
          <button
            type="button"
            className={cn('controlToggle', { active: blurEnabled, disabled: !cameraEnabled })}
            onClick={handleToggleBlur}
            disabled={!cameraEnabled}
          />
        </div>
        {blurEnabled && (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Intensity</span>
              <input
                type="range"
                className={cn('rangeInput')}
                min={0}
                max={1}
                step={0.05}
                value={blurIntensity}
                onChange={(e) => handleBlurIntensity(Number(e.target.value))}
              />
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Mode</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={blurMode}
                onChange={(e) => handleBlurMode(e.target.value as 'BACKGROUND' | 'FOREGROUND')}
              >
                <option value="BACKGROUND">Background</option>
                <option value="FOREGROUND">Foreground</option>
              </select>
            </div>
          </>
        )}

        {/* Virtual Background */}
        <div className={cn('controlRow')}>
          <span className={cn('controlLabel')}>Virtual background</span>
          <button
            type="button"
            className={cn('controlToggle', { active: vbEnabled, disabled: !cameraEnabled })}
            onClick={handleToggleVb}
            disabled={!cameraEnabled}
          />
        </div>
        {vbEnabled && (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Color</span>
              <input
                type="color"
                className={cn('colorInput')}
                value={vbColor}
                onChange={(e) => handleVbColor(e.target.value)}
              />
            </div>
            <div className={cn('controlRow')}>
              <input
                type="text"
                className={cn('textInput')}
                placeholder="Image URL"
                value={vbImageUrl}
                onChange={(e) => handleVbImageUrl(e.target.value)}
              />
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Fit</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={vbFitMode}
                onChange={(e) => handleVbFitMode(e.target.value)}
              >
                {BG_FIT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  )

  const moreTab = (
    <div className={cn('controls')}>
      {/* Transcription */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Transcription</h3>
        {!transcriptionSupported ? (
          <p className={cn('controlHint')}>Not supported in this browser</p>
        ) : (
          <>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Enable</span>
              <button
                type="button"
                className={cn('controlToggle', { active: transcriptionActive, disabled: !micEnabled })}
                onClick={handleToggleTranscription}
                disabled={!micEnabled}
              />
            </div>
            <div className={cn('controlRow')}>
              <span className={cn('controlLabel')}>Language</span>
              <select
                className={cn('deviceSelect', { compact: true })}
                value={transcriptionLanguage}
                onChange={(e) => handleTranscriptionLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
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
          <button type="button" className={cn('actionBtn', { small: true, variant: 'danger' })} onClick={handleResetConfig}>
            Reset all
          </button>
        </div>
      </div>
    </div>
  )

  const controlTabs = [
    { id: 'devices', label: 'Devices', content: devicesTab },
    { id: 'capture', label: 'Capture', content: captureTab },
    { id: 'effects', label: 'Effects', content: effectsTab },
    { id: 'more', label: 'More', content: moreTab },
  ]

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
              className={cn('video', { hidden: !cameraEnabled, mirrored: cameraEnabled && facingMode === 'user' })}
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
          <Tabs tabs={controlTabs} />
        </div>
      </div>
    </div>
  )
}

export default PlaygroundPage
