import { useState, useEffect, useCallback } from 'react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

const DISPLAY_SURFACES = [
  { value: 'monitor', label: 'Monitor' },
  { value: 'window', label: 'Window' },
  { value: 'application', label: 'Application' },
]

const SCREEN_SHARE_MODES = [
  { value: 'presentation', label: 'Presentation' },
  { value: 'video', label: 'Video' },
]

const CONTENT_HINTS = [
  { value: '', label: 'Auto' },
  { value: 'motion', label: 'Motion' },
  { value: 'detail', label: 'Detail' },
  { value: 'text', label: 'Text' },
]

interface ScreenShareTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const ScreenShareTab = ({ media, onError }: ScreenShareTabProps) => {
  const [screenShareActive, setScreenShareActive] = useState(false)
  const [displaySurface, setDisplaySurface] = useState('monitor')
  const [includeAudio, setIncludeAudio] = useState(false)
  const [screenShareMode, setScreenShareMode] = useState('presentation')
  const [contentHint, setContentHint] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      media.screenShareController.onStateChange((state) => {
        setScreenShareActive(state.isActive)
      }),
    )

    const handleError = (event: { source: string; error: unknown }) =>
      onError(`${event.source}: ${event.error instanceof Error ? event.error.message : String(event.error)}`)
    unsubs.push(media.screenShareController.onError(handleError))

    return () => unsubs.forEach((fn) => fn())
  }, [media, onError])

  const showError = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e))

  const toggleScreenShare = useCallback(async () => {
    onError(null)
    try { await media.screenShareController.toggle() } catch (e) { showError(e) }
  }, [media, onError])

  const handleDisplaySurface = useCallback((val: string) => {
    setDisplaySurface(val)
    media.screenShareController.updateDisplaySurface(val as 'monitor' | 'window' | 'application')
  }, [media])

  const handleIncludeAudio = useCallback(() => {
    const next = !includeAudio
    setIncludeAudio(next)
    media.screenShareController.updateAudioIncluded(next)
  }, [media, includeAudio])

  const handleScreenShareMode = useCallback((val: string) => {
    setScreenShareMode(val)
    media.screenShareController.updateMode(val as 'presentation' | 'video')
  }, [media])

  const handleContentHint = useCallback((val: string) => {
    setContentHint(val)
    media.screenShareController.updateContentHint(val as '' | 'motion' | 'detail' | 'text')
  }, [media])

  return (
    <div className={cn('controls')}>
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Screen Share</h3>
        <HintRow label="Share" hint="Включить/выключить демонстрацию экрана. Откроет системный диалог выбора области">
          <button type="button" className={cn('controlToggle', { active: screenShareActive })} onClick={toggleScreenShare} />
        </HintRow>
        <button type="button" className={cn('sectionToggle', { nested: true })} onClick={() => setSettingsOpen((v) => !v)}>
          <span className={cn('controlLabel')}>Settings</span>
          <span className={cn('sectionArrow', { open: settingsOpen })}>▸</span>
        </button>
        {settingsOpen && (
          <>
            <HintRow label="Mode" hint="Presentation — для слайдов и документов (5 FPS, максимальная чёткость). Video — для фильмов и игр (30 FPS, плавная картинка)">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={screenShareMode}
                onChange={(e) => handleScreenShareMode(e.target.value)}
              >
                {SCREEN_SHARE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </HintRow>
            <HintRow label="Surface" hint="Тип захватываемой области. Monitor — весь экран, Window — одно окно, Application — все окна приложения">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={displaySurface}
                onChange={(e) => handleDisplaySurface(e.target.value)}
              >
                {DISPLAY_SURFACES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </HintRow>
            <HintRow label="Include audio" hint="Захватывать системный звук вместе с изображением экрана">
              <button
                type="button"
                className={cn('controlToggle', { active: includeAudio })}
                onClick={handleIncludeAudio}
              />
            </HintRow>
            <HintRow label="Content hint" hint="Подсказка кодеку для оптимизации. Auto — автовыбор, Motion — плавность движений, Detail — чёткость изображения, Text — максимальная чёткость текста">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={contentHint}
                onChange={(e) => handleContentHint(e.target.value)}
              >
                {CONTENT_HINTS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </HintRow>
          </>
        )}
      </div>
    </div>
  )
}

export default ScreenShareTab
