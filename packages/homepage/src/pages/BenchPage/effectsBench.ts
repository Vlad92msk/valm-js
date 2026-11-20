// Замер нагрузки видеоэффектов valm на основной поток (T563).
// Страница /bench показывает цифры сама (телефон, ноутбук); scripts/effects-bench.mjs
// гоняет её в Chromium через window.__effectsBench и собирает таблицу.
import { Valm, DeviceDetector } from 'valm-js'
import { EffectsPlugin, SegmentationProvider } from 'valm-js/effects'

export type BenchScenario = 'none' | 'blur' | 'bg'
export type BenchDelegate = 'auto' | 'GPU' | 'CPU'

export interface BenchOptions {
  // Маска на GPU (новый путь) или чтение маски на CPU (старый путь)
  gpuMask: boolean
  delegate: BenchDelegate
  preset: 'mobile' | 'low' | 'medium' | 'high'
}

export interface SeriesStats {
  n: number
  mean: number
  p50: number
  p95: number
  max: number
}

export interface BenchSnapshot {
  // Окно замера, с
  window: number
  outFps: number
  pipelineFps: number
  // Доля окна, которую основной поток провёл в кадре эффекта (renderFrame), %
  effectBusyPct: number
  frame: SeriesStats | null
  segmentation: SeriesStats | null
  longTasksSupported: boolean
  longTasksPerSec: number
  longTaskMsPerSec: number
  longTaskMax: number
  raf: SeriesStats | null
  rafOver33Pct: number
}

export interface BenchInfo {
  delegate: 'GPU' | 'CPU'
  gpuMaskRequested: boolean
  // Маска реально пришла текстурой (провайдер вернул gpuMask)
  gpuMaskActive: boolean | null
  processorType: string
  renderer: string
  resolution: string
  preset: string
  userAgent: string
}

interface TimedSample {
  t: number
  d: number
}

const WINDOW_MS = 5000

function stats(values: number[]): SeriesStats | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  return {
    n: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: pick(0.5),
    p95: pick(0.95),
    max: sorted[sorted.length - 1],
  }
}

function readRenderer(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'WebGL недоступен'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  } catch {
    return 'н/д'
  }
}

// Фон для сценария «замена фона»: рисуется на месте, без внешних файлов
function makeBackgroundUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const gradient = ctx.createLinearGradient(0, 0, 1280, 720)
  gradient.addColorStop(0, '#1d3557')
  gradient.addColorStop(0.5, '#457b9d')
  gradient.addColorStop(1, '#a8dadc')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1280, 720)
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `hsla(${(i * 37) % 360}, 60%, 60%, 0.35)`
    ctx.beginPath()
    ctx.arc((i * 211) % 1280, (i * 127) % 720, 40 + ((i * 53) % 120), 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas.toDataURL('image/jpeg', 0.9)
}

export class EffectsBench {
  readonly valm: Valm
  readonly options: BenchOptions
  private readonly plugin: EffectsPlugin
  private readonly provider: SegmentationProvider
  private readonly delegate: 'GPU' | 'CPU'
  private readonly renderer = readRenderer()
  private backgroundUrl: string | null = null
  private outputVideo: HTMLVideoElement | null = null
  private scenario: BenchScenario = 'none'
  private gpuMaskActive: boolean | null = null

  private frames: TimedSample[] = []
  private segmentations: TimedSample[] = []
  private longTasks: TimedSample[] = []
  private rafs: TimedSample[] = []
  private outFrames: number[] = []
  private pipelineFrames: number[] = []

  private running = false
  private rafId = 0
  private lastRaf = 0
  private observer: PerformanceObserver | null = null
  private readonly longTasksSupported: boolean

  constructor(options: BenchOptions) {
    this.options = options
    this.delegate = options.delegate === 'auto' ? (DeviceDetector.isMobile() ? 'CPU' : 'GPU') : options.delegate

    this.provider = new SegmentationProvider({
      minInterval: 33,
      cacheEnabled: true,
      config: { delegate: this.delegate, gpuMask: options.gpuMask },
    })
    this.plugin = new EffectsPlugin({ providers: { segmentation: this.provider }, performance: { preset: options.preset } })
    this.valm = new Valm({ video: { resolution: { width: 1280, height: 720 }, frameRate: 30 } }).use(this.plugin)

    this.longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')
    this.instrument()
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.outputVideo = video
    await this.valm.cameraController.enable()
    this.attachOutput()
    this.running = true
    this.startLoops()
  }

  async setScenario(scenario: BenchScenario): Promise<void> {
    const effects = this.valm.effectsController
    effects.disableAllEffects()
    if (scenario === 'blur') await effects.enableBlur()
    if (scenario === 'bg') {
      this.backgroundUrl ??= makeBackgroundUrl()
      await effects.setVirtualBackground(this.backgroundUrl)
    }
    this.scenario = scenario
    this.gpuMaskActive = null
    this.attachOutput()
    this.reset()
  }

  getScenario(): BenchScenario {
    return this.scenario
  }

  reset(): void {
    this.frames = []
    this.segmentations = []
    this.longTasks = []
    this.rafs = []
    this.outFrames = []
    this.pipelineFrames = []
  }

  // Цифры за последние WINDOW_MS (или за всё время с reset, если меньше)
  snapshot(windowMs = WINDOW_MS): BenchSnapshot {
    const now = performance.now()
    const from = now - windowMs
    const inWindow = (list: TimedSample[]) => list.filter((s) => s.t >= from)
    const frames = inWindow(this.frames)
    const segmentations = inWindow(this.segmentations)
    const longTasks = inWindow(this.longTasks)
    const rafs = inWindow(this.rafs)
    const outFrames = this.outFrames.filter((t) => t >= from)
    const pipelineFrames = this.pipelineFrames.filter((t) => t >= from)

    const firstSample = Math.min(
      ...[this.rafs[0]?.t, this.outFrames[0]].filter((t): t is number => t !== undefined),
      now,
    )
    const span = Math.max(0.001, (now - Math.max(from, firstSample)) / 1000)
    const frameMs = frames.reduce((a, s) => a + s.d, 0)
    const rafValues = rafs.map((s) => s.d)

    return {
      window: span,
      outFps: outFrames.length / span,
      pipelineFps: pipelineFrames.length / span,
      effectBusyPct: (frameMs / 1000 / span) * 100,
      frame: stats(frames.map((s) => s.d)),
      segmentation: stats(segmentations.map((s) => s.d)),
      longTasksSupported: this.longTasksSupported,
      longTasksPerSec: longTasks.length / span,
      longTaskMsPerSec: longTasks.reduce((a, s) => a + s.d, 0) / span,
      longTaskMax: longTasks.reduce((a, s) => Math.max(a, s.d), 0),
      raf: stats(rafValues),
      rafOver33Pct: rafValues.length ? (rafValues.filter((d) => d > 33.5).length / rafValues.length) * 100 : 0,
    }
  }

  info(): BenchInfo {
    const pipeline = this.plugin.pipeline
    const settings = this.valm.cameraController.getTrack()?.getSettings()
    return {
      delegate: this.delegate,
      gpuMaskRequested: this.options.gpuMask,
      gpuMaskActive: this.gpuMaskActive,
      processorType: pipeline?.getState().processorType ?? 'н/д',
      renderer: this.renderer,
      resolution: settings ? `${settings.width}×${settings.height} @ ${Math.round(settings.frameRate ?? 0)}` : 'н/д',
      preset: pipeline?.getPerformanceConfig().preset ?? 'н/д',
      userAgent: navigator.userAgent,
    }
  }

  // Замер фиксированного окна (для скрипта прогона)
  async measure(ms: number): Promise<BenchSnapshot> {
    this.reset()
    await new Promise((resolve) => setTimeout(resolve, ms))
    return this.snapshot(ms)
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.observer?.disconnect()
    this.observer = null
    if (this.outputVideo) this.outputVideo.srcObject = null
    this.valm.destroy()
  }

  private attachOutput(): void {
    const track = this.valm.cameraController.getTrack()
    if (!this.outputVideo || !track) return
    this.outputVideo.srcObject = new MediaStream([track])
    this.outputVideo.play().catch(() => {})
  }

  // Время кадра pipeline и сегментации. renderFrame — внутренний метод pipeline: обёртка
  // нужна только этой странице замера (публичного API для таймингов у valm нет)
  private instrument(): void {
    const pipeline = this.plugin.pipeline as unknown as { renderFrame: (t: number) => Promise<void> } | null
    if (pipeline) {
      const renderFrame = pipeline.renderFrame.bind(pipeline)
      pipeline.renderFrame = async (timestamp: number) => {
        const start = performance.now()
        await renderFrame(timestamp)
        const end = performance.now()
        this.frames.push({ t: end, d: end - start })
        this.pipelineFrames.push(end)
      }
    }

    const provider = this.provider
    const detect = provider.detect.bind(provider)
    provider.detect = async (imageData, timestamp) => {
      const start = performance.now()
      const result = await detect(imageData, timestamp)
      this.segmentations.push({ t: performance.now(), d: performance.now() - start })
      this.gpuMaskActive = !!result.gpuMask
      return result
    }

    const detectSource = provider.detectSource.bind(provider)
    provider.detectSource = async (source, width, height, timestamp) => {
      const start = performance.now()
      const result = await detectSource(source, width, height, timestamp)
      this.segmentations.push({ t: performance.now(), d: performance.now() - start })
      this.gpuMaskActive = !!result.gpuMask
      return result
    }
  }

  private startLoops(): void {
    this.lastRaf = performance.now()
    const tick = (t: number) => {
      if (!this.running) return
      this.rafs.push({ t, d: t - this.lastRaf })
      this.lastRaf = t
      this.trim()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)

    const video = this.outputVideo
    if (video && 'requestVideoFrameCallback' in video) {
      const onFrame = () => {
        if (!this.running) return
        this.outFrames.push(performance.now())
        video.requestVideoFrameCallback(onFrame)
      }
      video.requestVideoFrameCallback(onFrame)
    }

    if (this.longTasksSupported) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({ t: entry.startTime + entry.duration, d: entry.duration })
        }
      })
      this.observer.observe({ type: 'longtask', buffered: false })
    }
  }

  // Держим в памяти не больше минуты
  private trim(): void {
    const limit = performance.now() - 60_000
    if (this.rafs.length > 0 && this.rafs[0].t < limit) {
      this.rafs = this.rafs.filter((s) => s.t >= limit)
      this.frames = this.frames.filter((s) => s.t >= limit)
      this.segmentations = this.segmentations.filter((s) => s.t >= limit)
      this.longTasks = this.longTasks.filter((s) => s.t >= limit)
      this.outFrames = this.outFrames.filter((t) => t >= limit)
      this.pipelineFrames = this.pipelineFrames.filter((t) => t >= limit)
    }
  }
}
