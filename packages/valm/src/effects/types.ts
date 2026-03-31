import { FaceMeshWorkerResult } from './providers/face-mesh.client'
import { SegmentationResult } from './providers/segmentation.client'

type SegmentationWorkerResult = SegmentationResult

export enum EffectType {
  BACKGROUND_BLUR = 'background_blur',
  VIRTUAL_BACKGROUND = 'virtual_background',
  FACE_MASK = 'face_mask',
  BEAUTY_FILTER = 'beauty_filter',
  COLOR_FILTER = 'color_filter',
}

// Фичи, которые требует эффект — pipeline инициализирует только нужные провайдеры
export enum EffectFeature {
  SEGMENTATION = 'segmentation',
  FACE_MESH = 'faceMesh',
}

export interface FrameContext {
  sourceCanvas: HTMLCanvasElement
  sourceCtx: CanvasRenderingContext2D

  outputCanvas: HTMLCanvasElement
  outputCtx: CanvasRenderingContext2D

  width: number
  height: number

  timestamp: number

  // Заполняется pipeline если есть эффекты с EffectFeature.SEGMENTATION
  segmentation?: SegmentationWorkerResult

  // Маска, масштабированная под размер canvas
  segmentationMask?: Uint8Array

  // Заполняется pipeline если есть эффекты с EffectFeature.FACE_MESH
  faceMesh?: FaceMeshWorkerResult
}

export interface IVideoEffect<TParams = unknown> {
  readonly name: string
  readonly type: EffectType
  readonly requiredFeatures: EffectFeature[]

  initialize(): Promise<void>

  // Синхронный метод! Все async операции уже выполнены pipeline, результаты в ctx
  apply(ctx: FrameContext): void

  updateParams(params: Partial<TParams>): void
  getParams(): TParams
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  dispose(): void
}

export interface IMLProvider<TConfig = unknown, TResult = unknown> {
  initialize(config?: TConfig): Promise<void>
  detect(imageData: ImageData, timestamp?: number): Promise<TResult>
  getLastResult(): TResult | null
  wouldReturnCache(): boolean
  isReady(): boolean
  clearCache(): void
  dispose(): Promise<void>
}

export interface PipelineConfig {
  width?: number
  height?: number

  // 'auto' = insertable-streams если доступен, иначе canvas
  processorType?: 'auto' | 'canvas' | 'insertable-streams'

  performance?: PerformanceConfig
}

export interface PipelineState {
  isRunning: boolean
  currentFps: number
  activeEffects: string[]
  gpuEnabled: boolean
  processorType?: 'canvas' | 'insertable-streams'
}

export interface IVideoProcessingPipeline {
  start(inputTrack: MediaStreamTrack): Promise<void>
  stop(): void
  dispose(): void

  getOutputTrack(): MediaStreamTrack | null

  addEffect(effect: IVideoEffect): Promise<void>
  removeEffect(name: string): void
  getEffect<T extends IVideoEffect>(name: string): T | null
  getEffects(): IVideoEffect[]
  reorderEffects(order: string[]): void

  isRunning(): boolean
  getState(): PipelineState

  setPerformanceConfig(config: PerformanceConfig): void
  getPerformanceConfig(): PerformanceConfig
}

export interface IFrameSource {
  initialize(track: MediaStreamTrack): Promise<void>
  capture(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void
  getVideoDimensions(): { width: number; height: number }
  dispose(): void

  // Подписка на изменение размеров
  onDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void
  offDimensionsChanged(callback: (dimensions: { width: number; height: number }) => void): void
}

export interface IFrameOutput {
  initialize(width: number, height: number, fps: number): void
  getTrack(): MediaStreamTrack | null
  getCanvas(): HTMLCanvasElement
  getContext(): CanvasRenderingContext2D
  dispose(): void

  // Генерирует новый кадр — вызывается pipeline после каждого рендера
  requestFrame(): void

  resize(width: number, height: number): void
}

export type FrameProcessorType = 'canvas' | 'insertable-streams'

export function supportsInsertableStreams(): boolean {
  return typeof MediaStreamTrackProcessor !== 'undefined' && typeof MediaStreamTrackGenerator !== 'undefined'
}

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

export type QualityPreset = 'mobile' | 'low' | 'medium' | 'high' | 'ultra' | 'custom'

export interface PerformanceConfig {
  preset?: QualityPreset

  // 1 = каждый кадр, 2 = каждый второй и т.д.
  mlFrameSkip?: number

  targetFps?: number
  blurQuality?: number
  mlResolutionScale?: number
}
