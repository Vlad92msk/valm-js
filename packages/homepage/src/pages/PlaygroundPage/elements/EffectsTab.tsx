import { useState, useEffect, useCallback } from 'react'
import type { Valm } from 'valm-js'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'
import HintRow from './Hint'

const cn = makeCn('PlaygroundPage', styles)

const BG_FIT_MODES = [
  { value: 'COVER', label: 'Cover' },
  { value: 'CONTAIN', label: 'Contain' },
  { value: 'STRETCH', label: 'Stretch' },
  { value: 'TILE', label: 'Tile' },
]

interface EffectsTabProps {
  media: Valm
  onError: (error: string | null) => void
}

const EffectsTab = ({ media, onError }: EffectsTabProps) => {
  // Blur
  const [blurEnabled, setBlurEnabled] = useState(false)
  const [blurIntensity, setBlurIntensity] = useState(0.5)
  const [blurMode, setBlurMode] = useState<'BACKGROUND' | 'FOREGROUND'>('BACKGROUND')
  const [blurEdgeSmoothing, setBlurEdgeSmoothing] = useState(true)
  const [blurSmoothingThreshold, setBlurSmoothingThreshold] = useState(0.6)

  // Virtual background
  const [vbEnabled, setVbEnabled] = useState(false)
  const [vbColor, setVbColor] = useState('#00AA00')
  const [vbImageUrl, setVbImageUrl] = useState('')
  const [vbFitMode, setVbFitMode] = useState('COVER')
  const [vbEdgeSmoothing, setVbEdgeSmoothing] = useState(true)
  const [vbSmoothingThreshold, setVbSmoothingThreshold] = useState(0.5)
  const [vbEdgeBlur, setVbEdgeBlur] = useState(2)

  // Pipeline
  const [effectsQualityPreset, setEffectsQualityPreset] = useState('medium')
  const [pipelineState, setPipelineState] = useState<{ isRunning: boolean; fps: number; effects: string[] } | null>(null)

  // Camera dependency
  const [cameraEnabled, setCameraEnabled] = useState(false)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    unsubs.push(
      media.cameraController.onStateChange((state) => {
        setCameraEnabled(state.isEnabled)
      }),
    )

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

    const handleError = (event: { source: string; error: unknown }) =>
      onError(`${event.source}: ${event.error instanceof Error ? event.error.message : String(event.error)}`)
    unsubs.push(media.effectsController.onError(handleError))

    return () => unsubs.forEach((fn) => fn())
  }, [media, onError])

  const showError = (e: unknown) =>
    onError(e instanceof Error ? e.message : String(e))

  const handleToggleBlur = useCallback(async () => {
    onError(null)
    try { await media.effectsController.toggleBlur() } catch (e) { showError(e) }
  }, [media, onError])

  const handleBlurIntensity = useCallback((val: number) => {
    setBlurIntensity(val)
    media.effectsController.setBlurIntensity(val)
  }, [media])

  const handleBlurMode = useCallback((mode: 'BACKGROUND' | 'FOREGROUND') => {
    setBlurMode(mode)
    media.effectsController.setBlurMode(mode as any)
  }, [media])

  const handleBlurEdgeSmoothing = useCallback((val: boolean) => {
    setBlurEdgeSmoothing(val)
    media.effectsController.updateBlurParams({ edgeSmoothing: val })
  }, [media])

  const handleBlurSmoothingThreshold = useCallback((val: number) => {
    setBlurSmoothingThreshold(val)
    media.effectsController.updateBlurParams({ smoothingThreshold: val })
  }, [media])

  const handleToggleVb = useCallback(async () => {
    onError(null)
    try {
      if (vbEnabled) {
        media.effectsController.removeVirtualBackground()
      } else if (vbImageUrl) {
        await media.effectsController.setVirtualBackground(vbImageUrl)
      } else {
        await media.effectsController.setVirtualBackgroundColor(vbColor)
      }
    } catch (e) { showError(e) }
  }, [media, onError, vbEnabled, vbImageUrl, vbColor])

  const handleVbColor = useCallback(async (color: string) => {
    setVbColor(color)
    if (vbEnabled) {
      try { await media.effectsController.setVirtualBackgroundColor(color) } catch (e) { showError(e) }
    }
  }, [media, vbEnabled])

  const handleVbImageUrl = useCallback(async (url: string) => {
    setVbImageUrl(url)
    if (vbEnabled && url) {
      try { await media.effectsController.setVirtualBackground(url) } catch (e) { showError(e) }
    }
  }, [media, vbEnabled])

  const handleVbFitMode = useCallback((mode: string) => {
    setVbFitMode(mode)
    media.effectsController.setVirtualBackgroundFitMode(mode as any)
  }, [media])

  const handleVbEdgeSmoothing = useCallback((val: boolean) => {
    setVbEdgeSmoothing(val)
    media.effectsController.updateVirtualBackgroundParams({ edgeSmoothing: val })
  }, [media])

  const handleVbSmoothingThreshold = useCallback((val: number) => {
    setVbSmoothingThreshold(val)
    media.effectsController.updateVirtualBackgroundParams({ smoothingThreshold: val })
  }, [media])

  const handleVbEdgeBlur = useCallback((val: number) => {
    setVbEdgeBlur(val)
    media.effectsController.updateVirtualBackgroundParams({ edgeBlur: val })
  }, [media])

  const handleEffectsQualityPreset = useCallback((preset: string) => {
    setEffectsQualityPreset(preset)
    media.effectsController.setQualityPreset(preset as any)
  }, [media])

  return (
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
        <HintRow label="Background blur" hint="Размытие фона за человеком. Требует включённой камеры">
          <button
            type="button"
            className={cn('controlToggle', { active: blurEnabled, disabled: !cameraEnabled })}
            onClick={handleToggleBlur}
            disabled={!cameraEnabled}
          />
        </HintRow>
        {blurEnabled && (
          <>
            <HintRow label="Intensity" hint="Сила размытия: 0 — без эффекта, 1 — максимальное размытие">
              <input
                type="range"
                className={cn('rangeInput')}
                min={0}
                max={1}
                step={0.05}
                value={blurIntensity}
                onChange={(e) => handleBlurIntensity(Number(e.target.value))}
              />
            </HintRow>
            <HintRow label="Mode" hint="Background — размывает фон за человеком. Foreground — размывает самого человека, оставляя фон чётким">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={blurMode}
                onChange={(e) => handleBlurMode(e.target.value as 'BACKGROUND' | 'FOREGROUND')}
              >
                <option value="BACKGROUND">Background</option>
                <option value="FOREGROUND">Foreground</option>
              </select>
            </HintRow>
            <HintRow label="Edge smoothing" hint="Сглаживание границы между человеком и фоном. Убирает резкие края сегментации">
              <button
                type="button"
                className={cn('controlToggle', { active: blurEdgeSmoothing })}
                onClick={() => handleBlurEdgeSmoothing(!blurEdgeSmoothing)}
              />
            </HintRow>
            {blurEdgeSmoothing && (
              <HintRow label="Threshold" hint="Порог сегментации: ниже — больше пикселей считается фоном, выше — больше считается человеком">
                <input
                  type="range"
                  className={cn('rangeInput')}
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={blurSmoothingThreshold}
                  onChange={(e) => handleBlurSmoothingThreshold(Number(e.target.value))}
                />
              </HintRow>
            )}
          </>
        )}

        {/* Virtual Background */}
        <HintRow label="Virtual background" hint="Замена фона на изображение или сплошной цвет. Требует включённой камеры">
          <button
            type="button"
            className={cn('controlToggle', { active: vbEnabled, disabled: !cameraEnabled })}
            onClick={handleToggleVb}
            disabled={!cameraEnabled}
          />
        </HintRow>
        {vbEnabled && (
          <>
            <HintRow label="Color" hint="Сплошной цвет фона. Используется, если не указан URL изображения">
              <input
                type="color"
                className={cn('colorInput')}
                value={vbColor}
                onChange={(e) => handleVbColor(e.target.value)}
              />
            </HintRow>
            <div className={cn('controlRow')}>
              <input
                type="text"
                className={cn('textInput')}
                placeholder="Image URL"
                value={vbImageUrl}
                onChange={(e) => handleVbImageUrl(e.target.value)}
              />
            </div>
            <HintRow label="Fit" hint="Способ масштабирования фонового изображения. Cover — заполнить без полос, Contain — вписать целиком, Stretch — растянуть, Tile — замостить">
              <select
                className={cn('deviceSelect', { compact: true })}
                value={vbFitMode}
                onChange={(e) => handleVbFitMode(e.target.value)}
              >
                {BG_FIT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </HintRow>
            <HintRow label="Edge smoothing" hint="Сглаживание границы между человеком и виртуальным фоном">
              <button
                type="button"
                className={cn('controlToggle', { active: vbEdgeSmoothing })}
                onClick={() => handleVbEdgeSmoothing(!vbEdgeSmoothing)}
              />
            </HintRow>
            {vbEdgeSmoothing && (
              <HintRow label="Threshold" hint="Порог сегментации для виртуального фона. Влияет на то, сколько пикселей считается частью человека">
                <input
                  type="range"
                  className={cn('rangeInput')}
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={vbSmoothingThreshold}
                  onChange={(e) => handleVbSmoothingThreshold(Number(e.target.value))}
                />
              </HintRow>
            )}
            <HintRow label="Edge blur" hint="Размытие по краям силуэта. Чем больше значение — тем мягче переход между человеком и фоном">
              <input
                type="range"
                className={cn('rangeInput')}
                min={0}
                max={10}
                step={1}
                value={vbEdgeBlur}
                onChange={(e) => handleVbEdgeBlur(Number(e.target.value))}
              />
            </HintRow>
          </>
        )}
      </div>

      {/* Quality Preset */}
      <div className={cn('controlGroup')}>
        <h3 className={cn('controlGroupTitle')}>Pipeline Quality</h3>
        <HintRow label="Preset" hint="Качество обработки эффектов. Mobile — минимальная нагрузка, Ultra — максимальное качество сегментации. Влияет на частоту и точность обработки кадров">
          <select
            className={cn('deviceSelect', { compact: true })}
            value={effectsQualityPreset}
            onChange={(e) => handleEffectsQualityPreset(e.target.value)}
          >
            <option value="mobile">Mobile</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
        </HintRow>
      </div>
    </div>
  )
}

export default EffectsTab
