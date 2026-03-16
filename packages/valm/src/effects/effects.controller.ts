import { TypedEventEmitter } from '../core/utils/typed-event-emitter'
import { MediaStreamService } from '../core/media-stream/media-stream.service'
import { BackgroundBlurEffect, BackgroundBlurParams, BlurMode } from './effects/background-blur-effect'
import { BackgroundFitMode, VirtualBackgroundEffect, VirtualBackgroundParams } from './effects/virtual-background-effect'
import { EffectType, IVideoEffect, IVideoProcessingPipeline, PerformanceConfig, PipelineState, QualityPreset } from './types'

/**
 * Состояние эффектов
 */
export interface EffectsState {
  isProcessingEnabled: boolean
  activeEffects: string[]
  currentFps: number
  blur: {
    isEnabled: boolean
    intensity: number
    mode: BlurMode
  }
  virtualBackground: {
    isEnabled: boolean
    image: string | null
  }
  performance?: PerformanceConfig
}

/**
 * Callbacks
 */
export type EffectsStateChangeCallback = (state: EffectsState) => void
export type EffectsErrorCallback = (error: { source: string; action?: string; error: unknown }) => void

/**
 * События контроллера
 */
export enum EffectsEvents {
  STATE_CHANGED = 'stateChanged',
  EFFECT_ENABLED = 'effectEnabled',
  EFFECT_DISABLED = 'effectDisabled',
  EFFECT_ADDED = 'effectAdded',
  EFFECT_REMOVED = 'effectRemoved',
  PROCESSING_STARTED = 'processingStarted',
  PROCESSING_STOPPED = 'processingStopped',
  ERROR = 'error',
  QUALITY_CHANGED = 'quality:changed',
  PERFORMANCE_CHANGED = 'performance:changed',
}

/**
 * Типизированная карта событий EffectsController
 */
interface EffectsEventMap {
  [EffectsEvents.STATE_CHANGED]: (state: EffectsState) => void
  [EffectsEvents.EFFECT_ENABLED]: (data: { effect: string }) => void
  [EffectsEvents.EFFECT_DISABLED]: (data: { effect: string }) => void
  [EffectsEvents.EFFECT_ADDED]: (data: { effect: string }) => void
  [EffectsEvents.EFFECT_REMOVED]: (data: { effect: string }) => void
  [EffectsEvents.PROCESSING_STARTED]: () => void
  [EffectsEvents.PROCESSING_STOPPED]: () => void
  [EffectsEvents.ERROR]: (error: { source: string; action?: string; error: unknown }) => void
  [EffectsEvents.QUALITY_CHANGED]: (data: { preset: QualityPreset }) => void
  [EffectsEvents.PERFORMANCE_CHANGED]: (config: PerformanceConfig) => void
}

/**
 * EffectsController — управление видео эффектами
 *
 * Предоставляет простой API для:
 * - Включения/выключения размытия фона
 * - Установки виртуального фона
 * - Управления параметрами эффектов
 */
export class EffectsController extends TypedEventEmitter<EffectsEventMap> {
  private blurEffect: BackgroundBlurEffect | null = null
  private virtualBackgroundEffect: VirtualBackgroundEffect | null = null

  private stateCallbacks = new Set<EffectsStateChangeCallback>()
  private errorCallbacks = new Set<EffectsErrorCallback>()

  constructor(private mediaStreamService: MediaStreamService) {
    super()
  }

  /**
   * Получить pipeline. Бросает ошибку если pipeline не установлен.
   */
  private requirePipeline(): IVideoProcessingPipeline {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()
    if (!pipeline) {
      throw new Error(
        'VideoProcessingPipeline не инициализирован. Убедитесь, что EffectsPlugin установлен.',
      )
    }
    return pipeline
  }

  // ============================================
  // Универсальное управление эффектами
  // ============================================

  /**
   * Добавить кастомный эффект в pipeline
   */
  addEffect = async (effect: IVideoEffect): Promise<void> => {
    try {
      const pipeline = this.requirePipeline()
      await pipeline.addEffect(effect)

      this.emit(EffectsEvents.EFFECT_ADDED, { effect: effect.name })
      this.emit(EffectsEvents.EFFECT_ENABLED, { effect: effect.name })
      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'addEffect', error })
      throw error
    }
  }

  /**
   * Удалить эффект из pipeline по имени
   */
  removeEffect = (name: string): void => {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()
    if (!pipeline) return

    // Если удаляется встроенный эффект — обнуляем ссылку
    if (this.blurEffect && this.blurEffect.name === name) {
      this.blurEffect = null
    }
    if (this.virtualBackgroundEffect && this.virtualBackgroundEffect.name === name) {
      this.virtualBackgroundEffect = null
    }

    pipeline.removeEffect(name)

    this.emit(EffectsEvents.EFFECT_REMOVED, { effect: name })
    this.emit(EffectsEvents.EFFECT_DISABLED, { effect: name })
    this.notifyStateChange()
  }

  /**
   * Получить эффект по имени
   */
  getEffect = <T extends IVideoEffect>(name: string): T | null => {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()
    return pipeline?.getEffect<T>(name) ?? null
  }

  /**
   * Получить все эффекты в pipeline
   */
  getEffects = (): IVideoEffect[] => {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()
    return pipeline?.getEffects() ?? []
  }

  // ============================================
  // Background Blur
  // ============================================

  /**
   * Включить размытие фона
   */
  enableBlur = async (params?: Partial<BackgroundBlurParams>): Promise<void> => {
    try {
      const pipeline = this.requirePipeline()

      if (!this.blurEffect) {
        this.blurEffect = new BackgroundBlurEffect(params)

        await pipeline.addEffect(this.blurEffect)
      } else {
        this.blurEffect.setEnabled(true)
        if (params) {
          this.blurEffect.updateParams(params)
        }
      }

      this.emit(EffectsEvents.EFFECT_ENABLED, { effect: EffectType.BACKGROUND_BLUR })
      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'enableBlur', error })
      throw error
    }
  }

  /**
   * Выключить размытие фона
   */
  disableBlur = (): void => {
    if (this.blurEffect) {
      this.blurEffect.setEnabled(false)
      this.emit(EffectsEvents.EFFECT_DISABLED, { effect: EffectType.BACKGROUND_BLUR })
      this.notifyStateChange()
    }
  }

  /**
   * Переключить размытие фона
   */
  toggleBlur = async (): Promise<void> => {
    if (this.blurEffect?.isEnabled()) {
      this.disableBlur()
    } else {
      await this.enableBlur()
    }
  }

  /**
   * Установить интенсивность размытия (0-1)
   */
  setBlurIntensity = (intensity: number): void => {
    if (this.blurEffect) {
      this.blurEffect.updateParams({ intensity: Math.max(0, Math.min(1, intensity)) })
      this.notifyStateChange()
    }
  }

  /**
   * Установить режим размытия
   */
  setBlurMode = (mode: BlurMode): void => {
    if (this.blurEffect) {
      this.blurEffect.updateParams({ mode })
      this.notifyStateChange()
    }
  }

  /**
   * Получить параметры blur
   */
  getBlurParams = (): BackgroundBlurParams | null => {
    return this.blurEffect?.getParams() ?? null
  }

  // ============================================
  // Virtual Background
  // ============================================

  /**
   * Установить виртуальный фон
   */
  setVirtualBackground = async (imageUrl: string): Promise<void> => {
    try {
      const pipeline = this.requirePipeline()

      if (!this.virtualBackgroundEffect) {
        this.virtualBackgroundEffect = new VirtualBackgroundEffect({ imageUrl })
        await this.virtualBackgroundEffect.initialize()
        await pipeline.addEffect(this.virtualBackgroundEffect)
      } else {
        await this.virtualBackgroundEffect.setBackgroundImage(imageUrl)
        this.virtualBackgroundEffect.setEnabled(true)
      }

      // Если blur активен, выключаем его (они конфликтуют)
      if (this.blurEffect?.isEnabled()) {
        this.disableBlur()
      }

      this.emit(EffectsEvents.EFFECT_ENABLED, { effect: EffectType.VIRTUAL_BACKGROUND })
      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setVirtualBackground', error })
      throw error
    }
  }

  /**
   * Убрать виртуальный фон
   */
  removeVirtualBackground = (): void => {
    if (this.virtualBackgroundEffect) {
      this.virtualBackgroundEffect.setEnabled(false)
      this.emit(EffectsEvents.EFFECT_DISABLED, { effect: EffectType.VIRTUAL_BACKGROUND })
      this.notifyStateChange()

      // НЕ останавливаем pipeline
    }
  }

  /**
   * Переключить виртуальный фон
   */
  toggleVirtualBackground = async (imageUrl?: string): Promise<void> => {
    if (this.virtualBackgroundEffect?.isEnabled()) {
      this.removeVirtualBackground()
    } else {
      if (!imageUrl) {
        throw new Error('Image URL is required to enable virtual background')
      }
      await this.setVirtualBackground(imageUrl)
    }
  }

  /**
   * Установить цвет фона вместо изображения
   */
  setVirtualBackgroundColor = async (color: string): Promise<void> => {
    try {
      const pipeline = this.requirePipeline()

      if (!this.virtualBackgroundEffect) {
        this.virtualBackgroundEffect = new VirtualBackgroundEffect({
          imageUrl: null,
          backgroundColor: color,
        })
        await this.virtualBackgroundEffect.initialize()
        await pipeline.addEffect(this.virtualBackgroundEffect)

        // Если blur активен, выключаем его (они конфликтуют)
        if (this.blurEffect?.isEnabled()) {
          this.disableBlur()
        }

        this.emit(EffectsEvents.EFFECT_ENABLED, { effect: EffectType.VIRTUAL_BACKGROUND })
      } else {
        this.virtualBackgroundEffect.updateParams({
          imageUrl: null,
          backgroundColor: color,
        })
        this.virtualBackgroundEffect.setEnabled(true)
      }

      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setVirtualBackgroundColor', error })
      throw error
    }
  }

  /**
   * Установить режим масштабирования фона
   */
  setVirtualBackgroundFitMode = (mode: BackgroundFitMode): void => {
    if (this.virtualBackgroundEffect) {
      this.virtualBackgroundEffect.updateParams({ fitMode: mode })
      this.notifyStateChange()
    }
  }

  /**
   * Обновить параметры виртуального фона
   */
  updateVirtualBackgroundParams = (params: Partial<VirtualBackgroundParams>): void => {
    if (this.virtualBackgroundEffect) {
      this.virtualBackgroundEffect.updateParams(params)
      this.notifyStateChange()
    }
  }

  /**
   * Получить параметры виртуального фона
   */
  getVirtualBackgroundParams = (): VirtualBackgroundParams | null => {
    return this.virtualBackgroundEffect?.getParams() ?? null
  }

  // ============================================
  // Performance Settings
  // ============================================

  /**
   * Установить пресет качества
   */
  setQualityPreset = (preset: QualityPreset): void => {
    try {
      const pipeline = this.requirePipeline()
      pipeline.setPerformanceConfig({ preset })

      this.emit(EffectsEvents.QUALITY_CHANGED, { preset })
      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setQualityPreset', error })
      throw error
    }
  }

  /**
   * Установить кастомные настройки производительности
   */
  setPerformanceConfig = (config: PerformanceConfig): void => {
    try {
      const pipeline = this.requirePipeline()
      pipeline.setPerformanceConfig(config)

      this.emit(EffectsEvents.PERFORMANCE_CHANGED, config)
      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setPerformanceConfig', error })
      throw error
    }
  }

  /**
   * Получить текущие настройки производительности
   */
  getPerformanceConfig = (): PerformanceConfig => {
    return this.requirePipeline().getPerformanceConfig()
  }

  /**
   * Установить качество blur (быстрый метод)
   */
  setBlurQuality = (quality: number): void => {
    try {
      const pipeline = this.requirePipeline()
      pipeline.setPerformanceConfig({
        preset: 'custom',
        blurQuality: quality,
      })

      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setBlurQuality', error })
      throw error
    }
  }

  /**
   * Установить целевой FPS (быстрый метод)
   */
  setTargetFps = (fps: number): void => {
    try {
      const pipeline = this.requirePipeline()
      pipeline.setPerformanceConfig({
        preset: 'custom',
        targetFps: fps,
      })

      this.notifyStateChange()
    } catch (error) {
      this.notifyError({ source: 'effects', action: 'setTargetFps', error })
      throw error
    }
  }

  // ============================================
  // General
  // ============================================

  /**
   * Выключить все эффекты (встроенные и кастомные)
   */
  disableAllEffects = (): void => {
    const effects = this.getEffects()
    for (const effect of effects) {
      effect.setEnabled(false)
    }

    // НЕ останавливаем pipeline - он всегда работает
    this.notifyStateChange()
  }

  /**
   * Полностью остановить обработку видео — удаляет все эффекты из pipeline
   */
  stopProcessing = (): void => {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()

    // Удаляем все эффекты из pipeline (встроенные и кастомные)
    if (pipeline) {
      const effects = pipeline.getEffects()
      for (const effect of effects) {
        pipeline.removeEffect(effect.name)
      }
    }

    this.blurEffect = null
    this.virtualBackgroundEffect = null

    this.emit(EffectsEvents.PROCESSING_STOPPED)
    this.notifyStateChange()
  }

  /**
   * Получить состояние
   */
  get state(): EffectsState {
    const pipeline = this.mediaStreamService.getVideoTrackManager().getPipeline()
    const pipelineState = pipeline?.getState()
    const performanceConfig = pipeline?.getPerformanceConfig()

    return {
      isProcessingEnabled: pipeline?.isRunning() ?? false,
      activeEffects: pipelineState?.activeEffects ?? [],
      currentFps: pipelineState?.currentFps ?? 0,
      blur: {
        isEnabled: this.blurEffect?.isEnabled() ?? false,
        intensity: this.blurEffect?.getParams().intensity ?? 0.7,
        mode: this.blurEffect?.getParams().mode ?? BlurMode.BACKGROUND,
      },
      virtualBackground: {
        isEnabled: this.virtualBackgroundEffect?.isEnabled() ?? false,
        image: this.virtualBackgroundEffect?.getParams().imageUrl ?? null,
      },
      performance: performanceConfig,
    }
  }

  /**
   * Получить состояние pipeline
   */
  getPipelineState = (): PipelineState | null => {
    return this.mediaStreamService.getVideoTrackManager().getPipeline()?.getState() ?? null
  }

  // ============================================
  // Subscriptions
  // ============================================

  /**
   * Подписка на изменение состояния
   */
  onStateChange = (callback: EffectsStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  /**
   * Подписка на ошибки
   */
  onError(callback: EffectsErrorCallback): VoidFunction {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Уничтожить контроллер
   */
  destroy(): void {
    this.stopProcessing()
    this.stateCallbacks.clear()
    this.errorCallbacks.clear()
    this.removeAllListeners()
  }

  // ============================================
  // Private
  // ============================================

  /**
   * Уведомить об изменении состояния
   */
  private notifyStateChange(): void {
    const currentState = this.state
    this.stateCallbacks.forEach((callback) => callback(currentState))
    this.emit(EffectsEvents.STATE_CHANGED, currentState)
  }

  /**
   * Уведомить об ошибке
   */
  private notifyError(error: { source: string; action?: string; error: unknown }): void {
    this.errorCallbacks.forEach((callback) => callback(error))
    this.emit(EffectsEvents.ERROR, error)
  }
}
