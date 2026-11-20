import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import styles from './BenchPage.module.scss'
import { makeCn } from '../../utils/makeCn'
import { EffectsBench } from './effectsBench'
import type { BenchDelegate, BenchInfo, BenchOptions, BenchScenario, BenchSnapshot, SeriesStats } from './effectsBench'

const cn = makeCn('BenchPage', styles)

const SCENARIOS: BenchScenario[] = ['none', 'blur', 'bg']
const DELEGATES: BenchDelegate[] = ['auto', 'GPU', 'CPU']
const PRESETS: BenchOptions['preset'][] = ['mobile', 'low', 'medium', 'high']

declare global {
  interface Window {
    // Управление страницей из scripts/effects-bench.mjs
    __effectsBench?: {
      ready: boolean
      setOptions: (options: Partial<BenchOptions>) => Promise<void>
      setScenario: (scenario: BenchScenario) => Promise<void>
      measure: (ms: number) => Promise<BenchSnapshot>
      info: () => BenchInfo | null
      error: string | null
    }
  }
}

function readOptions(): BenchOptions {
  const params = new URLSearchParams(window.location.search)
  const delegate = params.get('delegate')
  const preset = params.get('preset')
  return {
    gpuMask: params.get('gpu') !== '0',
    delegate: DELEGATES.includes(delegate as BenchDelegate) ? (delegate as BenchDelegate) : 'auto',
    preset: PRESETS.includes(preset as BenchOptions['preset']) ? (preset as BenchOptions['preset']) : 'medium',
  }
}

function ms(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(1)
}

function series(value: SeriesStats | null): string {
  return value ? `${ms(value.mean)} / ${ms(value.p95)} / ${ms(value.max)}` : '—'
}

const BenchPage = () => {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const benchRef = useRef<EffectsBench | null>(null)
  // Запуск текущего valm: скрипт прогона ждёт его после смены настроек
  const startRef = useRef<{ bench: EffectsBench; done: Promise<void> } | null>(null)

  const [options, setOptions] = useState<BenchOptions>(() =>
    typeof window === 'undefined' ? { gpuMask: true, delegate: 'auto', preset: 'medium' } : readOptions(),
  )
  const [scenario, setScenario] = useState<BenchScenario>('none')
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<BenchSnapshot | null>(null)
  const [info, setInfo] = useState<BenchInfo | null>(null)

  // Пересоздаём valm при смене настроек: делегат и путь маски задаются при создании провайдера
  useEffect(() => {
    if (!started || !videoRef.current) return
    const bench = new EffectsBench(options)
    benchRef.current = bench
    let cancelled = false

    setBusy(true)
    const done = bench
      .start(videoRef.current)
      .then(() => (cancelled ? undefined : bench.setScenario(scenario)))
      .then(() => setError(null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
    startRef.current = { bench, done }

    return () => {
      cancelled = true
      bench.destroy()
      if (benchRef.current === bench) benchRef.current = null
    }
    // scenario применяется отдельным эффектом ниже — пересоздавать valm из-за него не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, options])

  useEffect(() => {
    const bench = benchRef.current
    if (!bench || bench.getScenario() === scenario) return
    setBusy(true)
    bench
      .setScenario(scenario)
      .then(() => setError(null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }, [scenario])

  useEffect(() => {
    if (!started) return
    const id = window.setInterval(() => {
      const bench = benchRef.current
      if (!bench) return
      setSnapshot(bench.snapshot())
      setInfo(bench.info())
    }, 1000)
    return () => window.clearInterval(id)
  }, [started])

  useEffect(() => {
    window.__effectsBench = {
      ready: true,
      error: null,
      setOptions: async (next) => {
        const previous = startRef.current
        setOptions((prev) => ({ ...prev, ...next }))
        setStarted(true)
        // Ждём, пока новый valm поднимет камеру
        for (let i = 0; i < 300 && (!startRef.current || startRef.current === previous); i++) {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        await startRef.current?.done
      },
      setScenario: async (next) => {
        await benchRef.current?.setScenario(next)
        setScenario(next)
      },
      measure: async (duration) => {
        if (!benchRef.current) throw new Error('bench not started')
        return benchRef.current.measure(duration)
      },
      info: () => benchRef.current?.info() ?? null,
    }
    return () => {
      delete window.__effectsBench
    }
  }, [])

  useEffect(() => {
    if (window.__effectsBench) window.__effectsBench.error = error
  }, [error])

  const handleStart = () => setStarted(true)
  const handleOption = (next: Partial<BenchOptions>) => setOptions((prev) => ({ ...prev, ...next }))

  const rows: Array<[string, string]> = snapshot
    ? [
        [t('bench.metrics.outFps'), snapshot.outFps.toFixed(1)],
        [t('bench.metrics.pipelineFps'), snapshot.pipelineFps.toFixed(1)],
        [t('bench.metrics.effectBusy'), `${snapshot.effectBusyPct.toFixed(1)}%`],
        [t('bench.metrics.frame'), series(snapshot.frame)],
        [t('bench.metrics.segmentation'), series(snapshot.segmentation)],
        [
          t('bench.metrics.longTasks'),
          snapshot.longTasksSupported
            ? `${snapshot.longTasksPerSec.toFixed(2)} / ${snapshot.longTaskMsPerSec.toFixed(0)} / ${snapshot.longTaskMax.toFixed(0)}`
            : t('bench.notSupported'),
        ],
        [t('bench.metrics.raf'), snapshot.raf ? `${ms(snapshot.raf.p50)} / ${ms(snapshot.raf.p95)} / ${ms(snapshot.raf.max)}` : '—'],
        [t('bench.metrics.rafOver33'), `${snapshot.rafOver33Pct.toFixed(1)}%`],
      ]
    : []

  const infoRows: Array<[string, string]> = info
    ? [
        [t('bench.info.delegate'), info.delegate],
        [
          t('bench.info.gpuMask'),
          `${info.gpuMaskRequested ? t('bench.on') : t('bench.off')} → ${
            info.gpuMaskActive === null ? '—' : info.gpuMaskActive ? t('bench.info.texture') : t('bench.info.cpuArray')
          }`,
        ],
        [t('bench.info.processor'), info.processorType],
        [t('bench.info.renderer'), info.renderer],
        [t('bench.info.resolution'), info.resolution],
        [t('bench.info.preset'), info.preset],
        [t('bench.info.userAgent'), info.userAgent],
      ]
    : []

  return (
    <div className={cn()}>
      <h1 className={cn('title')}>{t('bench.title')}</h1>
      <p className={cn('lead')}>{t('bench.lead')}</p>

      <div className={cn('layout')}>
        <div className={cn('previewColumn')}>
          <div className={cn('preview')}>
            <video ref={videoRef} className={cn('video')} autoPlay muted playsInline />
            {!started && (
              <button type="button" className={cn('start')} onClick={handleStart}>
                {t('bench.start')}
              </button>
            )}
          </div>
          {error && <div className={cn('error')}>{error}</div>}
        </div>

        <div className={cn('panel')}>
          <div className={cn('group')}>
            <span className={cn('label')}>{t('bench.scenario')}</span>
            <div className={cn('pills')}>
              {SCENARIOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!started || busy}
                  className={cn('pill', { active: scenario === s })}
                  onClick={() => setScenario(s)}
                >
                  {t(`bench.scenarios.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={cn('group')}>
            <span className={cn('label')}>{t('bench.maskPath')}</span>
            <div className={cn('pills')}>
              <button type="button" className={cn('pill', { active: options.gpuMask })} onClick={() => handleOption({ gpuMask: true })}>
                {t('bench.gpuMask')}
              </button>
              <button type="button" className={cn('pill', { active: !options.gpuMask })} onClick={() => handleOption({ gpuMask: false })}>
                {t('bench.cpuMask')}
              </button>
            </div>
          </div>

          <div className={cn('group')}>
            <span className={cn('label')}>{t('bench.delegate')}</span>
            <div className={cn('pills')}>
              {DELEGATES.map((d) => (
                <button key={d} type="button" className={cn('pill', { active: options.delegate === d })} onClick={() => handleOption({ delegate: d })}>
                  {d === 'auto' ? t('bench.auto') : d}
                </button>
              ))}
            </div>
          </div>

          <div className={cn('group')}>
            <span className={cn('label')}>{t('bench.preset')}</span>
            <div className={cn('pills')}>
              {PRESETS.map((p) => (
                <button key={p} type="button" className={cn('pill', { active: options.preset === p })} onClick={() => handleOption({ preset: p })}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <table className={cn('table')}>
            <tbody>
              {rows.map(([name, value]) => (
                <tr key={name}>
                  <th className={cn('cellName')}>{name}</th>
                  <td className={cn('cellValue')}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={cn('hint')}>{t('bench.legend')}</p>

          <table className={cn('table')}>
            <tbody>
              {infoRows.map(([name, value]) => (
                <tr key={name}>
                  <th className={cn('cellName')}>{name}</th>
                  <td className={cn('cellValue', { wrap: true })}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default BenchPage
