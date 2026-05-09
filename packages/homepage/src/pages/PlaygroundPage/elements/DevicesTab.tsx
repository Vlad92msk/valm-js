import { useState, useEffect, useCallback } from 'react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

const RESOLUTIONS = [
  { label: '480p', width: 640, height: 480 },
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
]

const FRAME_RATES = [15, 24, 30, 60]

interface DevicesTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const DevicesTab = ({ media, onError }: DevicesTabProps) => {
  // Camera
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [cameraSettings, setCameraSettings] = useState<{ width: number; height: number; frameRate: number } | null>(null)

  // Microphone
  const [micEnabled, setMicEnabled] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [volume, setVolume] = useState(0)
  const [selectedMic, setSelectedMic] = useState('')

  // Audio processing
  const [echoCancellation, setEchoCancellation] = useState(true)
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [autoGainControl, setAutoGainControl] = useState(true)

  // Devices
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [selectedSpeaker, setSelectedSpeaker] = useState('')

  // Permissions
  const [permissions, setPermissions] = useState<{ camera: string; microphone: string }>({
    camera: 'unknown',
    microphone: 'unknown',
  })

  // Video config
  const [resolution, setResolution] = useState('1280x720')
  const [frameRate, setFrameRate] = useState(30)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Sections
  const [audioProcessingOpen, setAudioProcessingOpen] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      media.devicesController.onChange((devices) => {
        setCameras(devices.cameras)
        setMicrophones(devices.microphones)
        setSpeakers(devices.speakers)
      }),
    )

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
      media.microphoneController.onStateChange((state) => {
        setMicEnabled(state.isEnabled)
        setMicMuted(state.isMuted)
        if (state.deviceId) setSelectedMic(state.deviceId)
      }),
    )

    unsubs.push(
      media.microphoneController.onVolumeChange(({ volume: v }) => setVolume(v)),
    )

    const handleError = (event: { source: string; error: unknown }) =>
      onError(`${event.source}: ${event.error instanceof Error ? event.error.message : String(event.error)}`)
    unsubs.push(media.cameraController.onError(handleError))
    unsubs.push(media.microphoneController.onError(handleError))

    const syncConfigToState = () => {
      const videoConfig = media.configurationController.getVideoConfig()
      setResolution(`${videoConfig.resolution.width}x${videoConfig.resolution.height}`)
      setFrameRate(videoConfig.frameRate)
      setFacingMode(videoConfig.facingMode)

      const audioConfig = media.configurationController.getAudioConfig()
      setEchoCancellation(audioConfig.echoCancellation)
      setNoiseSuppression(audioConfig.noiseSuppression)
      setAutoGainControl(audioConfig.autoGainControl)
    }

    unsubs.push(media.configurationController.onImport(syncConfigToState))
    unsubs.push(media.configurationController.onReset(syncConfigToState))

    media.devicesController.getAvailable().then((devices) => {
      setCameras(devices.cameras)
      setMicrophones(devices.microphones)
      setSpeakers(devices.speakers)
    })
    media.devicesController.checkPermissions().then(setPermissions)

    return () => unsubs.forEach((fn) => fn())
  }, [media, onError])

  const showError = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e))

  const requestPermissions = useCallback(async () => {
    onError(null)
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
  }, [media, onError])

  const toggleCamera = useCallback(async () => {
    onError(null)
    try { await media.cameraController.toggle() } catch (e) { showError(e) }
  }, [media, onError])

  const handleCameraChange = useCallback(async (deviceId: string) => {
    onError(null)
    try { await media.cameraController.switchDevice(deviceId) } catch (e) { showError(e) }
  }, [media, onError])

  const handleToggleFacing = useCallback(async () => {
    onError(null)
    try { await media.cameraController.toggleFacing() } catch (e) { showError(e) }
  }, [media, onError])

  const handleResolution = useCallback((val: string) => {
    setResolution(val)
    const [w, h] = val.split('x').map(Number)
    media.configurationController.setVideoResolution(w, h)
  }, [media])

  const handleFrameRate = useCallback((val: number) => {
    setFrameRate(val)
    media.configurationController.setVideoFrameRate(val)
  }, [media])

  const handleFacingMode = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    media.configurationController.updateVideoConfig({ facingMode: next })
  }, [media, facingMode])

  const toggleMic = useCallback(async () => {
    onError(null)
    try { await media.microphoneController.toggle() } catch (e) { showError(e) }
  }, [media, onError])

  const toggleMicMute = useCallback(async () => {
    await media.microphoneController.toggleMute()
  }, [media])

  const handleMicChange = useCallback(async (deviceId: string) => {
    onError(null)
    try { await media.microphoneController.switchDevice(deviceId) } catch (e) { showError(e) }
  }, [media, onError])

  const handleAudioProcessing = useCallback((key: string, value: boolean) => {
    const next = { echoCancellation, noiseSuppression, autoGainControl, [key]: value }
    if (key === 'echoCancellation') setEchoCancellation(value)
    if (key === 'noiseSuppression') setNoiseSuppression(value)
    if (key === 'autoGainControl') setAutoGainControl(value)
    media.microphoneController.updateAudioProcessing(next)
  }, [media, echoCancellation, noiseSuppression, autoGainControl])

  const handleSpeakerChange = useCallback(async (deviceId: string) => {
    onError(null)
    try {
      await media.audioOutputController.setOutputDevice(deviceId)
      setSelectedSpeaker(deviceId)
    } catch (e) { showError(e) }
  }, [media, onError])

  const handleTestSound = useCallback(async () => {
    try { await media.audioOutputController.playTestSound() } catch (e) { showError(e) }
  }, [media])

  return (
    <div className={cn('controls')}>
      {/* Permissions */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Permissions</h3>
        <HintRow label="Camera" hint="Статус разрешения на доступ к камере: granted — разрешён, denied — запрещён, prompt — ещё не запрошен">
          <span className={cn('badge', { variant: permissions.camera })}>{permissions.camera}</span>
        </HintRow>
        <HintRow label="Microphone" hint="Статус разрешения на доступ к микрофону: granted — разрешён, denied — запрещён, prompt — ещё не запрошен">
          <span className={cn('badge', { variant: permissions.microphone })}>{permissions.microphone}</span>
        </HintRow>
        <div className={cn('controlRowActions')}>
          <button type="button" className={cn('actionBtn')} onClick={requestPermissions}>
            Request permissions
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Camera</h3>
        <HintRow label="Enable" hint="Включить/выключить камеру. При первом включении браузер запросит разрешение">
          <button type="button" className={cn('controlToggle', { active: cameraEnabled })} onClick={toggleCamera} />
        </HintRow>
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
        <HintRow label="Resolution" hint="Разрешение видео с камеры. Выше — чётче картинка, но больше нагрузка на CPU и сеть">
          <select
            className={cn('deviceSelect', { compact: true })}
            value={resolution}
            onChange={(e) => handleResolution(e.target.value)}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>
            ))}
          </select>
        </HintRow>
        <HintRow label="Frame rate" hint="Частота кадров в секунду. 15–24 — экономия трафика, 30 — стандарт, 60 — максимальная плавность">
          <select
            className={cn('deviceSelect', { compact: true })}
            value={frameRate}
            onChange={(e) => handleFrameRate(Number(e.target.value))}
          >
            {FRAME_RATES.map((f) => (
              <option key={f} value={f}>{f} fps</option>
            ))}
          </select>
        </HintRow>
        <HintRow label={`Facing: ${facingMode}`} hint="User — фронтальная камера (для видеозвонков). Environment — задняя камера (для мобильных устройств)">
          <button type="button" className={cn('actionBtn', { small: true })} onClick={handleFacingMode}>
            Switch
          </button>
        </HintRow>
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
        <HintRow label="Enable" hint="Включить/выключить микрофон. При первом включении браузер запросит разрешение">
          <button type="button" className={cn('controlToggle', { active: micEnabled })} onClick={toggleMic} />
        </HintRow>
        {micEnabled && (
          <>
            <HintRow label="Mute" hint="Заглушить микрофон. Поток остаётся активным, но передаётся тишина">
              <button type="button" className={cn('controlToggle', { active: micMuted })} onClick={toggleMicMute} />
            </HintRow>
            <HintRow label="Volume" hint="Текущий уровень громкости входного сигнала микрофона">
              <div className={cn('volumeBar')}>
                <div className={cn('volumeLevel')} style={{ width: `${volume}%` }} />
              </div>
            </HintRow>
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
            <button type="button" className={cn('sectionToggle', { nested: true })} onClick={() => setAudioProcessingOpen((v) => !v)}>
              <span className={cn('controlLabel')}>Audio processing</span>
              <span className={cn('sectionArrow', { open: audioProcessingOpen })}>▸</span>
            </button>
            {audioProcessingOpen && (
              <>
                <HintRow label="Echo cancel" hint="Подавление эха от динамиков. Предотвращает зацикливание звука при использовании динамиков вместо наушников">
                  <button
                    type="button"
                    className={cn('controlToggle', { active: echoCancellation })}
                    onClick={() => handleAudioProcessing('echoCancellation', !echoCancellation)}
                  />
                </HintRow>
                <HintRow label="Noise suppression" hint="Подавление фонового шума (вентилятор, клавиатура, окружение). Рекомендуется для звонков">
                  <button
                    type="button"
                    className={cn('controlToggle', { active: noiseSuppression })}
                    onClick={() => handleAudioProcessing('noiseSuppression', !noiseSuppression)}
                  />
                </HintRow>
                <HintRow label="Auto gain" hint="Автоматическая регулировка громкости. Выравнивает уровень звука — тихую речь усиливает, громкую приглушает">
                  <button
                    type="button"
                    className={cn('controlToggle', { active: autoGainControl })}
                    onClick={() => handleAudioProcessing('autoGainControl', !autoGainControl)}
                  />
                </HintRow>
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
}

export default DevicesTab
