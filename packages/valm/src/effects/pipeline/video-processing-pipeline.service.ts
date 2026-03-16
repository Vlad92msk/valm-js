import { FrameProcessorFactory } from './frame/frame-processor-factory'
import { MLProvidersManager } from './ml-providers-manager'
import { FaceMeshWorkerResult } from '../providers/face-mesh.client'
import { SegmentationResult } from '../providers/segmentation.client'
import { FrameContext, IFrameOutput, IFrameSource, IVideoEffect, IVideoProcessingPipeline, PerformanceConfig, PipelineConfig, PipelineState, QualityPreset } from '../types'

type InternalPipelineConfig = PipelineConfig & { width: number; height: number; processorType: 'auto' | 'canvas' | 'insertable-streams'; performance: PerformanceConfig }

/**
 * Пресеты качества
 */
export const QUALITY_PRESETS: Record<Exclude<QualityPreset, 'custom'>, Required<Omit<PerformanceConfig, 'preset'>>> = {
  low: {
    mlFrameSkip: 3, // ML: 10fps
    targetFps: 24, // Render: 24fps
    blurQuality: 8, // Слабый blur
    mlResolutionScale: 0.75, // 75% разрешения
  },
  medium: {
    mlFrameSkip: 2, // ML: 15fps
    targetFps: 30, // Render: 30fps
    blurQuality: 15, // Средний blur
    mlResolutionScale: 1.0, // Полное разрешение
  },
  high: {
    mlFrameSkip: 1, // ML: 30fps
    targetFps: 30, // Render: 30fps
    blurQuality: 20, // Сильный blur
    mlResolutionScale: 1.0, // Полное разрешение
  },
  ultra: {
    mlFrameSkip: 1, // ML: 60fps
    targetFps: 60, // Render: 60fps
    blurQuality: 25, // Максимальный blur
    mlResolutionScale: 1.0, // Полное разрешение
  },
}

export const DEFAULT_CONFIG: InternalPipelineConfig = {
  width: 640,
  height: 480,
  processorType: 'auto',
  performance: {
    preset: 'medium',
  },
}
/**
 * VideoProcessingPipelineService — обработка видео с эффектами в реальном времени
 */
export class VideoProcessingPipelineService implements IVideoProcessingPipeline {
  // Config
  private config: InternalPipelineConfig

  // Frame processing
  private frameSource: IFrameSource | null = null
  private frameOutput: IFrameOutput | null = null

  // ML провайдеры
  private providers: MLProvidersManager

  // Effects
  private effects: IVideoEffect[] = []

  // Canvases
  private sourceCanvas: HTMLCanvasElement | null = null
  private sourceCtx: CanvasRenderingContext2D | null = null
  private workCanvas: HTMLCanvasElement | null = null
  private workCtx: CanvasRenderingContext2D | null = null

  // ML-масштабирование: промежуточный canvas для уменьшенного разрешения ML-детекции
  private mlCanvas: HTMLCanvasElement | null = null
  private mlCtx: CanvasRenderingContext2D | null = null

  // State
  private running = false
  private animationFrameId: number | null = null
  private boundHandleDimensionsChanged: (dimensions: { width: number; height: number }) => void

  // Performance
  private mlFrameSkip = 2
  private mlFrameCounter = 0
  private frameInterval = 1000 / 30
  private mlResolutionScale = 1.0

  // FPS tracking
  private lastFrameTime = 0
  private frameCount = 0
  private fpsUpdateTime = 0
  private currentFps = 0

  constructor(config: PipelineConfig = {}) {
    this.boundHandleDimensionsChanged = this.handleDimensionsChanged.bind(this)
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      performance: {
        preset: config.performance?.preset || 'medium',
        ...config.performance,
      },
    }

    this.providers = new MLProvidersManager()

    // Processor type
    if (this.config.processorType !== 'auto') {
      FrameProcessorFactory.forceType(this.config.processorType)
    }

    // Применяем performance настройки
    this.applyPerformanceConfig(this.config.performance)
  }

  /**
   * Получить менеджер ML-провайдеров (для регистрации кастомных провайдеров)
   */
  getProvidersManager(): MLProvidersManager {
    return this.providers
  }

  /**
   * Установить настройки производительности
   */
  setPerformanceConfig(config: PerformanceConfig): void {
    this.config.performance = {
      ...this.config.performance,
      ...config,
    }

    this.applyPerformanceConfig(this.config.performance)
  }

  /**
   * Получить текущие настройки производительности
   */
  getPerformanceConfig(): PerformanceConfig {
    return { ...this.config.performance }
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Запустить pipeline
   */
  async start(inputTrack: MediaStreamTrack): Promise<void> {
    if (this.running) return

    // 1. Создаём FrameSource
    this.frameSource = FrameProcessorFactory.createSource()
    await this.frameSource.initialize(inputTrack)

    // Подписываемся на изменение размеров
    this.frameSource.onDimensionsChanged(this.boundHandleDimensionsChanged)

    // 2. Получаем размеры из трека
    const dimensions = this.frameSource.getVideoDimensions()
    this.config.width = dimensions.width
    this.config.height = dimensions.height

    // 3. Создаём canvases
    this.initializeCanvases()

    // 4. Создаём FrameOutput
    const activeConfig = this.resolvePerformanceConfig(this.config.performance)
    this.frameOutput = FrameProcessorFactory.createOutput()
    this.frameOutput.initialize(this.config.width, this.config.height, activeConfig.targetFps)

    // 5. Инициализируем провайдеры для текущих эффектов
    await this.providers.initializeRequired()

    // 6. Запускаем loop
    this.running = true
    this.lastFrameTime = performance.now()
    this.fpsUpdateTime = this.lastFrameTime
    this.frameCount = 0

    this.scheduleNextFrame()
  }

  // Обработчик изменения размеров
  private handleDimensionsChanged(dimensions: { width: number; height: number }): void {
    this.config.width = dimensions.width
    this.config.height = dimensions.height

    // Освобождаем старые canvases и создаём новые
    this.disposeCanvases()
    this.initializeCanvases()

    // Обновляем размеры output
    if (this.frameOutput) {
      this.frameOutput.resize(dimensions.width, dimensions.height)
    }
  }

  /**
   * Остановить pipeline (провайдеры остаются загруженными)
   */
  stop(): void {
    if (!this.running) return

    this.running = false

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.frameSource) {
      this.frameSource.offDimensionsChanged(this.boundHandleDimensionsChanged)
      this.frameSource.dispose()
      this.frameSource = null
    }

    this.frameOutput?.dispose()
    this.frameOutput = null
  }

  /**
   * Полная очистка (dispose всего)
   */
  dispose(): void {
    this.stop()

    // Dispose effects
    for (const effect of this.effects) {
      effect.dispose()
    }
    this.effects = []

    // Dispose providers
    this.providers.dispose()

    // Cleanup canvases
    this.disposeCanvases()
  }

  // ============================================
  // Output
  // ============================================

  /**
   * Получить выходной трек
   */
  getOutputTrack(): MediaStreamTrack | null {
    return this.frameOutput?.getTrack() || null
  }

  // ============================================
  // Effects Management
  // ============================================

  /**
   * Добавить эффект
   * Автоматически инициализирует требуемые провайдеры
   */
  async addEffect(effect: IVideoEffect): Promise<void> {
    // Проверяем дубликат
    if (this.effects.some((e) => e.name === effect.name)) return

    // Инициализируем эффект
    await effect.initialize()

    // Добавляем
    this.effects.push(effect)

    // Обновляем required features
    this.providers.updateRequiredFeatures(this.effects)

    // Если pipeline запущен — инициализируем новые провайдеры
    if (this.running) {
      await this.providers.initializeRequired()
    }
  }

  /**
   * Удалить эффект
   */
  removeEffect(name: string): void {
    const index = this.effects.findIndex((e) => e.name === name)

    if (index === -1) return

    const effect = this.effects[index]
    effect.dispose()

    this.effects.splice(index, 1)

    // Обновляем required features и освобождаем неиспользуемые провайдеры
    this.providers.updateRequiredFeatures(this.effects)
    this.providers.disposeUnused()
  }

  /**
   * Получить эффект по имени
   */
  getEffect<T extends IVideoEffect>(name: string): T | null {
    return (this.effects.find((e) => e.name === name) as T) || null
  }

  /**
   * Получить все эффекты
   */
  getEffects(): IVideoEffect[] {
    return [...this.effects]
  }

  /**
   * Изменить порядок эффектов
   */
  reorderEffects(order: string[]): void {
    const reordered: IVideoEffect[] = []

    for (const name of order) {
      const effect = this.effects.find((e) => e.name === name)
      if (effect) {
        reordered.push(effect)
      }
    }

    // Добавляем эффекты, которые не были в order
    for (const effect of this.effects) {
      if (!reordered.includes(effect)) {
        reordered.push(effect)
      }
    }

    this.effects = reordered
  }

  // ============================================
  // State
  // ============================================

  /**
   * Запущен ли pipeline
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Получить состояние
   */
  getState(): PipelineState {
    return {
      isRunning: this.running,
      currentFps: Math.round(this.currentFps),
      activeEffects: this.effects.filter((e) => e.isEnabled()).map((e) => e.name),
      gpuEnabled: true,
      processorType: FrameProcessorFactory.getCurrentType(),
    }
  }

  // ============================================
  // Frame Processing (Private)
  // ============================================

  private scheduleNextFrame(): void {
    if (!this.running) return
    this.animationFrameId = requestAnimationFrame(() => this.processFrame())
  }

  private async processFrame(): Promise<void> {
    if (!this.running) return

    const now = performance.now()

    // Throttle to target FPS
    const elapsed = now - this.lastFrameTime

    if (elapsed < this.frameInterval) {
      this.scheduleNextFrame()
      return
    }

    this.lastFrameTime = now - (elapsed % this.frameInterval)

    try {
      await this.renderFrame(now)
    } catch (error) {
      console.error('Frame processing error:', error)
    }

    // Update FPS
    this.frameCount++
    if (now - this.fpsUpdateTime >= 1000) {
      this.currentFps = this.frameCount
      this.frameCount = 0
      this.fpsUpdateTime = now
    }

    this.scheduleNextFrame()
  }

  private async renderFrame(timestamp: number): Promise<void> {
    if (!this.frameSource || !this.frameOutput || !this.sourceCanvas || !this.sourceCtx) {
      return
    }

    const outputCanvas = this.frameOutput.getCanvas()
    const outputCtx = this.frameOutput.getContext()
    const { width, height } = this.config

    // 1. Capture frame from source
    this.frameSource.capture(this.sourceCanvas, this.sourceCtx)

    // 2. If no effects or all disabled — just copy
    const enabledEffects = this.effects.filter((e) => e.isEnabled())

    if (enabledEffects.length === 0) {
      outputCtx.drawImage(this.sourceCanvas, 0, 0)
      this.frameOutput.requestFrame()
      return
    }

    // 3. ML-детекция: полная каждый N-й кадр, кэш на остальных
    const runML = this.mlFrameCounter++ % this.mlFrameSkip === 0
    const mlResults = runML ? await this.providers.detect(this.captureImageData(), timestamp) : this.providers.getCachedResults()

    let segmentation = mlResults.segmentation

    // Если ML работал на уменьшенном разрешении — масштабируем маску обратно
    if (segmentation && this.mlResolutionScale < 1.0) {
      segmentation = this.upscaleSegmentation(segmentation, width, height)
    }

    const segmentationMask = segmentation?.maskData

    // 4. Apply effects chain
    this.applyEffectsChain(enabledEffects, outputCanvas, outputCtx, segmentation, segmentationMask, mlResults.faceMesh, timestamp)
    this.frameOutput.requestFrame()
  }

  private captureImageData(): ImageData {
    // При mlResolutionScale < 1.0 масштабируем вниз через ML canvas
    if (this.mlResolutionScale < 1.0 && this.mlCanvas && this.mlCtx && this.sourceCanvas) {
      const mlWidth = this.mlCanvas.width
      const mlHeight = this.mlCanvas.height

      this.mlCtx.drawImage(this.sourceCanvas, 0, 0, mlWidth, mlHeight)
      return this.mlCtx.getImageData(0, 0, mlWidth, mlHeight)
    }

    if (!this.sourceCtx) {
      throw new Error('Source context not initialized')
    }

    const { width, height } = this.config
    return this.sourceCtx.getImageData(0, 0, width, height)
  }

  /**
   * Применить цепочку эффектов
   */
  private applyEffectsChain(
    effects: IVideoEffect[],
    outputCanvas: HTMLCanvasElement,
    outputCtx: CanvasRenderingContext2D,
    segmentation: SegmentationResult | null,
    segmentationMask: Uint8Array | undefined,
    faceMesh: FaceMeshWorkerResult | null,
    timestamp: number,
  ): void {
    if (!this.sourceCanvas || !this.sourceCtx || !this.workCanvas || !this.workCtx) return
    const { width, height } = this.config

    // Ping-pong: эффекты чередуют запись между outputCanvas и workCanvas.
    // Последний эффект всегда пишет в outputCanvas.
    // Промежуточные output определяются по чётности оставшихся эффектов.

    let currentSource = this.sourceCanvas
    let currentSourceCtx = this.sourceCtx
    let currentOutput = outputCanvas
    let currentOutputCtx = outputCtx

    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i]
      const isLast = i === effects.length - 1

      // Для не-последнего эффекта output может быть workCanvas
      if (!isLast) {
        // Если оставшихся эффектов нечётное число — пишем в workCanvas
        if ((effects.length - 1 - i) % 2 !== 0) {
          currentOutput = this.workCanvas
          currentOutputCtx = this.workCtx
        } else {
          currentOutput = outputCanvas
          currentOutputCtx = outputCtx
        }
      } else {
        // Последний эффект всегда пишет в outputCanvas
        currentOutput = outputCanvas
        currentOutputCtx = outputCtx
      }

      // Создаём context для эффекта
      const ctx: FrameContext = {
        sourceCanvas: currentSource,
        sourceCtx: currentSourceCtx,
        outputCanvas: currentOutput,
        outputCtx: currentOutputCtx,
        width,
        height,
        timestamp,
        segmentation: segmentation || undefined,
        segmentationMask,
        faceMesh: faceMesh || undefined,
      }

      // Применяем эффект
      effect.apply(ctx)

      // Swap для следующего эффекта
      if (!isLast) {
        currentSource = currentOutput
        currentSourceCtx = currentOutputCtx
      }
    }
  }

  // ============================================
  // Canvas Management (Private)
  // ============================================

  private initializeCanvases(): void {
    const { width, height } = this.config

    // Source canvas
    this.sourceCanvas = document.createElement('canvas')
    this.sourceCanvas.width = width
    this.sourceCanvas.height = height
    this.sourceCtx = this.sourceCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })

    // Work canvas (for effect chain swap)
    this.workCanvas = document.createElement('canvas')
    this.workCanvas.width = width
    this.workCanvas.height = height
    this.workCtx = this.workCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })

    // ML canvas для масштабированной ML-детекции
    this.initializeMlCanvas()
  }

  /**
   * Создать/пересоздать ML canvas под текущий mlResolutionScale
   */
  private initializeMlCanvas(): void {
    // При scale = 1.0 ML canvas не нужен — используем source напрямую
    if (this.mlResolutionScale >= 1.0) {
      this.disposeMlCanvas()
      return
    }

    const { width, height } = this.config
    const mlWidth = Math.round(width * this.mlResolutionScale)
    const mlHeight = Math.round(height * this.mlResolutionScale)

    if (mlWidth < 1 || mlHeight < 1) return

    // Если canvas уже нужного размера — не пересоздаём
    if (this.mlCanvas && this.mlCanvas.width === mlWidth && this.mlCanvas.height === mlHeight) {
      return
    }

    this.disposeMlCanvas()

    this.mlCanvas = document.createElement('canvas')
    this.mlCanvas.width = mlWidth
    this.mlCanvas.height = mlHeight
    this.mlCtx = this.mlCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    })
  }

  private applyPerformanceConfig(config: PerformanceConfig): void {
    const active = this.resolvePerformanceConfig(config)

    this.mlFrameSkip = active.mlFrameSkip
    this.frameInterval = 1000 / active.targetFps
    this.mlResolutionScale = Math.min(1, Math.max(0.1, active.mlResolutionScale))

    // Пересоздаём ML canvas под новый scale
    this.initializeMlCanvas()

    // Обновляем blur качество для всех эффектов
    this.updateBlurQuality(active.blurQuality)
  }

  private resolvePerformanceConfig(config: PerformanceConfig): Required<Omit<PerformanceConfig, 'preset'>> {
    const preset = config.preset || 'medium'

    if (preset === 'custom') {
      // Custom: используем указанные значения или дефолты из medium
      return {
        mlFrameSkip: config.mlFrameSkip ?? QUALITY_PRESETS.medium.mlFrameSkip,
        targetFps: config.targetFps ?? QUALITY_PRESETS.medium.targetFps,
        blurQuality: config.blurQuality ?? QUALITY_PRESETS.medium.blurQuality,
        mlResolutionScale: config.mlResolutionScale ?? QUALITY_PRESETS.medium.mlResolutionScale,
      }
    }

    // Preset: используем пресет, но можно override отдельные параметры
    const presetConfig = QUALITY_PRESETS[preset]
    return {
      mlFrameSkip: config.mlFrameSkip ?? presetConfig.mlFrameSkip,
      targetFps: config.targetFps ?? presetConfig.targetFps,
      blurQuality: config.blurQuality ?? presetConfig.blurQuality,
      mlResolutionScale: config.mlResolutionScale ?? presetConfig.mlResolutionScale,
    }
  }

  private updateBlurQuality(quality: number): void {
    for (const effect of this.effects) {
      if (effect.name === 'background_blur' && 'setBlurRadius' in effect) {
        ;(effect as { setBlurRadius(radius: number): void }).setBlurRadius(quality)
      }
    }
  }

  /**
   * Масштабирование маски сегментации до целевого разрешения (nearest neighbor)
   */
  private upscaleSegmentation(segmentation: SegmentationResult, targetWidth: number, targetHeight: number): SegmentationResult {
    const { maskData, width: srcW, height: srcH } = segmentation

    // Если размеры совпадают — возвращаем как есть
    if (srcW === targetWidth && srcH === targetHeight) return segmentation

    const upscaled = new Uint8Array(targetWidth * targetHeight)
    const xRatio = srcW / targetWidth
    const yRatio = srcH / targetHeight

    for (let y = 0; y < targetHeight; y++) {
      const srcY = Math.floor(y * yRatio)
      const srcRow = srcY * srcW
      const dstRow = y * targetWidth

      for (let x = 0; x < targetWidth; x++) {
        upscaled[dstRow + x] = maskData[srcRow + Math.floor(x * xRatio)]
      }
    }

    return {
      maskData: upscaled,
      width: targetWidth,
      height: targetHeight,
      timestamp: segmentation.timestamp,
    }
  }

  private disposeMlCanvas(): void {
    if (this.mlCanvas) {
      this.mlCanvas.width = 0
      this.mlCanvas.height = 0
      this.mlCanvas = null
    }
    this.mlCtx = null
  }

  private disposeCanvases(): void {
    if (this.sourceCanvas) {
      this.sourceCanvas.width = 0
      this.sourceCanvas.height = 0
      this.sourceCanvas = null
    }
    this.sourceCtx = null

    if (this.workCanvas) {
      this.workCanvas.width = 0
      this.workCanvas.height = 0
      this.workCanvas = null
    }
    this.workCtx = null

    this.disposeMlCanvas()
  }
}
