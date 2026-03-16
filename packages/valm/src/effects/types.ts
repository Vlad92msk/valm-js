import { FaceMeshWorkerResult } from './providers/face-mesh.client'
import { SegmentationResult } from './providers/segmentation.client'

type SegmentationWorkerResult = SegmentationResult
/**
 * Типы эффектов
 */
export enum EffectType {
  BACKGROUND_BLUR = 'background_blur',
  VIRTUAL_BACKGROUND = 'virtual_background',
  FACE_MASK = 'face_mask',
  BEAUTY_FILTER = 'beauty_filter',
  COLOR_FILTER = 'color_filter',
}

/**
 * Фичи, которые может требовать эффект
 * Pipeline инициализирует только нужные провайдеры
 */
export enum EffectFeature {
  SEGMENTATION = 'segmentation',
  FACE_MESH = 'faceMesh',
}

// ============================================
// Frame Context
// ============================================

/**
 * Контекст кадра, передаётся в каждый эффект
 *
 * Содержит:
 * - Canvas для чтения (source) и записи (output)
 * - Размеры и timestamp
 * - Предвычисленные данные от провайдеров
 */
export interface FrameContext {
  /** Canvas с исходным кадром (readonly) */
  sourceCanvas: HTMLCanvasElement
  sourceCtx: CanvasRenderingContext2D

  /** Canvas для результата (эффект рисует сюда) */
  outputCanvas: HTMLCanvasElement
  outputCtx: CanvasRenderingContext2D

  /** Размеры кадра */
  width: number
  height: number

  /** Timestamp кадра (performance.now()) */
  timestamp: number

  /** Результат сегментации (если есть эффекты, требующие SEGMENTATION) */
  segmentation?: SegmentationWorkerResult

  /** Маска сегментации, масштабированная под размер canvas */
  segmentationMask?: Uint8Array

  /** Результат детекции лица (если есть эффекты, требующие FACE_MESH) */
  faceMesh?: FaceMeshWorkerResult
}

// ============================================
// Video Effect Interface
// ============================================

/**
 * Базовый интерфейс для видео эффектов
 */
export interface IVideoEffect<TParams = unknown> {
  /** Уникальное имя эффекта */
  readonly name: string

  /** Тип эффекта */
  readonly type: EffectType

  /** Какие фичи требует эффект (segmentation, faceMesh) */
  readonly requiredFeatures: EffectFeature[]

  /**
   * Инициализация эффекта
   * Вызывается один раз при добавлении в pipeline
   */
  initialize(): Promise<void>

  /**
   * Применить эффект к кадру
   *
   * ВАЖНО: Метод синхронный! Все async операции (сегментация, faceMesh)
   * уже выполнены Pipeline и результаты доступны в ctx.
   *
   * Эффект должен:
   * 1. Прочитать данные из ctx.sourceCanvas
   * 2. Использовать ctx.segmentation / ctx.faceMesh если нужно
   * 3. Записать результат в ctx.outputCanvas
   */
  apply(ctx: FrameContext): void

  /**
   * Обновить параметры эффекта
   */
  updateParams(params: Partial<TParams>): void

  /**
   * Получить текущие параметры
   */
  getParams(): TParams

  /**
   * Включён ли эффект
   */
  isEnabled(): boolean

  /**
   * Включить/выключить эффект
   */
  setEnabled(enabled: boolean): void

  /**
   * Освободить ресурсы
   */
  dispose(): void
}

// ============================================
// ML Provider Interface
// ============================================

/**
 * Интерфейс ML-провайдера для pipeline
 *
 * Позволяет подключать кастомные модели (TensorFlow.js, ONNX и т.д.)
 * вместо встроенных MediaPipe провайдеров.
 *
 * @example
 * ```typescript
 * class MySegmentationProvider implements IMLProvider<MyConfig, SegmentationResult> {
 *   async initialize(config: MyConfig) { ... }
 *   async detect(imageData: ImageData, timestamp: number) { ... }
 *   getLastResult() { return this.cached }
 *   isReady() { return this.initialized }
 *   clearCache() { this.cached = null }
 *   async dispose() { ... }
 * }
 * ```
 */
export interface IMLProvider<TConfig = unknown, TResult = unknown> {
  /** Инициализировать провайдер. Конфиг опционален — провайдер может получать его через конструктор */
  initialize(config?: TConfig): Promise<void>

  /** Запустить детекцию на ImageData */
  detect(imageData: ImageData, timestamp?: number): Promise<TResult>

  /** Получить последний закэшированный результат */
  getLastResult(): TResult | null

  /** Готов ли провайдер к детекции */
  isReady(): boolean

  /** Очистить кэш */
  clearCache(): void

  /** Освободить ресурсы */
  dispose(): Promise<void>
}

// ============================================
// Pipeline Types
// ============================================

/**
 * Конфигурация Pipeline
 */
export interface PipelineConfig {
  /**
   * Ширина обработки
   * @default определяется из input track
   */
  width?: number

  /**
   * Высота обработки
   * @default определяется из input track
   */
  height?: number

  /**
   * Тип обработки кадров
   * @default 'auto' - автоматический выбор (insertable-streams если доступен, иначе canvas)
   */
  processorType?: 'auto' | 'canvas' | 'insertable-streams'

  /**
   * Настройки производительности/качества
   * @default { preset: 'medium' }
   */
  performance?: PerformanceConfig
}

export interface PipelineState {
  /** Запущен ли pipeline */
  isRunning: boolean
  /** Текущий FPS */
  currentFps: number
  /** Список активных эффектов */
  activeEffects: string[]
  /** Используется ли GPU */
  gpuEnabled: boolean
  /** Тип процессора кадров */
  processorType?: 'canvas' | 'insertable-streams'
}

/**
 * Интерфейс VideoProcessingPipeline
 */
export interface IVideoProcessingPipeline {
  // Lifecycle
  start(inputTrack: MediaStreamTrack): Promise<void>
  stop(): void
  dispose(): void

  // Output
  getOutputTrack(): MediaStreamTrack | null

  // Effects
  addEffect(effect: IVideoEffect): Promise<void>
  removeEffect(name: string): void
  getEffect<T extends IVideoEffect>(name: string): T | null
  getEffects(): IVideoEffect[]
  reorderEffects(order: string[]): void

  // State
  isRunning(): boolean
  getState(): PipelineState

  // Performance
  setPerformanceConfig(config: PerformanceConfig): void
  getPerformanceConfig(): PerformanceConfig
}

// ============================================
// Frame Source / Output
// ============================================

/**
 * Абстракция источника кадров
 */
export interface IFrameSource {
  /** Инициализация с входным треком */
  initialize(track: MediaStreamTrack): Promise<void>

  /** Захватить текущий кадр на canvas */
  capture(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void

  /** Получить размеры видео */
  getVideoDimensions(): { width: number; height: number }

  /** Освободить ресурсы */
  dispose(): void

  // Пдписка на изменение размеров
  onDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void
  offDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void
}

/**
 * Абстракция выхода pipeline
 */
export interface IFrameOutput {
  /** Инициализация */
  initialize(width: number, height: number, fps: number): void

  /** Получить output track */
  getTrack(): MediaStreamTrack | null

  /** Получить canvas для рисования */
  getCanvas(): HTMLCanvasElement

  /** Получить context */
  getContext(): CanvasRenderingContext2D

  /** Освободить ресурсы */
  dispose(): void

  /**
   * Принудительно генерирует новый кадр (для Safari)
   */
  requestFrame?(): void

  // Изменение размеров
  resize(width: number, height: number): void
}

/**
 * Тип реализации frame processing
 */
export type FrameProcessorType = 'canvas' | 'insertable-streams'

/**
 * Проверка поддержки Insertable Streams
 */
export function supportsInsertableStreams(): boolean {
  return typeof MediaStreamTrackProcessor !== 'undefined' && typeof MediaStreamTrackGenerator !== 'undefined'
}

/**
 * Получить оптимальный тип процессора
 */
export function getOptimalProcessorType(): FrameProcessorType {
  return supportsInsertableStreams() ? 'insertable-streams' : 'canvas'
}

// TypeScript типы для Insertable Streams API
declare global {
  class MediaStreamTrackProcessor {
    constructor(init: { track: MediaStreamTrack })
    readable: ReadableStream<VideoFrame>
  }

  class MediaStreamTrackGenerator extends MediaStreamTrack {
    constructor(init: { kind: 'video' | 'audio' })
    writable: WritableStream<VideoFrame>
  }

  interface VideoFrame {
    readonly timestamp: number
    readonly codedWidth: number
    readonly codedHeight: number
    readonly displayWidth: number
    readonly displayHeight: number
    close(): void
    clone(): VideoFrame
  }
}

/**
 * Пресеты качества
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom'

/**
 * Настройки производительности/качества
 */
export interface PerformanceConfig {
  /**
   * Пресет качества
   * @default 'medium'
   */
  preset?: QualityPreset

  /**
   * Пропускать каждый N-й кадр для ML (1 = без пропусков, 2 = каждый 2-й)
   * Используется только если preset = 'custom' или для override
   */
  mlFrameSkip?: number

  /**
   * Целевой FPS для рендеринга
   * Используется только если preset = 'custom' или для override
   */
  targetFps?: number

  /**
   * Качество blur эффекта (radius)
   * Используется только если preset = 'custom' или для override
   */
  blurQuality?: number

  /**
   * Разрешение для ML обработки (1.0 = полное, 0.5 = половина)
   * Используется только если preset = 'custom' или для override
   */
  mlResolutionScale?: number
}
