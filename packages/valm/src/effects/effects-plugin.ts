import { IMediaPlugin, PluginContext } from '../core/plugin.types'
import { EffectsController } from './effects.controller'
import { CustomProvidersConfig } from './pipeline/ml-providers-manager'
import { EffectFeature } from './types'
import { VideoProcessingPipelineService } from './pipeline/video-processing-pipeline.service'

/**
 * Опции для EffectsPlugin
 */
export interface EffectsPluginOptions {
  /**
   * Кастомные ML-провайдеры вместо встроенных MediaPipe.
   *
   * Позволяет подключить свои модели сегментации или face mesh
   * (TensorFlow.js, ONNX, и т.д.)
   *
   * @example
   * ```typescript
   * const plugin = new EffectsPlugin({
   *   providers: {
   *     segmentation: new MySegmentationProvider(),
   *   }
   * })
   * module.use(plugin)
   * ```
   */
  providers?: CustomProvidersConfig
}

/**
 * Плагин видео-эффектов.
 *
 * Подключает VideoProcessingPipeline к видео-менеджеру
 * и предоставляет EffectsController для управления эффектами.
 *
 * Без этого плагина модуль работает без видео-обработки —
 * тяжёлые ML-зависимости (@mediapipe/tasks-vision) не загружаются.
 *
 * @example
 * ```typescript
 * // Использование со встроенными MediaPipe провайдерами
 * const module = new Valm(config)
 * module.use(new EffectsPlugin())
 *
 * // Использование с кастомными провайдерами
 * module.use(new EffectsPlugin({
 *   providers: {
 *     segmentation: new MyCustomSegmentationProvider(),
 *     faceMesh: new MyCustomFaceMeshProvider(),
 *   }
 * }))
 * ```
 */
export class EffectsPlugin implements IMediaPlugin {
  readonly name = 'effects'

  private _controller: EffectsController | null = null
  private _pipeline: VideoProcessingPipelineService | null = null
  private _options: EffectsPluginOptions

  constructor(options: EffectsPluginOptions = {}) {
    this._options = options
  }

  /**
   * Контроллер эффектов. Доступен после install().
   */
  get controller(): EffectsController {
    if (!this._controller) {
      throw new Error('EffectsPlugin не установлен. Вызовите module.use(new EffectsPlugin()) перед использованием.')
    }
    return this._controller
  }

  /**
   * Pipeline видео-обработки. Доступен после install().
   */
  get pipeline(): VideoProcessingPipelineService | null {
    return this._pipeline
  }

  /**
   * Проверить, установлен ли плагин
   */
  get isInstalled(): boolean {
    return this._controller !== null
  }

  install(context: PluginContext): void {
    // Создаём pipeline и устанавливаем в видео-менеджер
    this._pipeline = new VideoProcessingPipelineService()
    const videoManager = context.mediaStreamService.getVideoTrackManager()
    videoManager.setPipeline(this._pipeline)

    // Регистрируем кастомные провайдеры если переданы
    if (this._options.providers) {
      const providers = this._options.providers
      const manager = this._pipeline.getProvidersManager()

      if (providers.segmentation) {
        manager.registerProvider(EffectFeature.SEGMENTATION, providers.segmentation)
      }
      if (providers.faceMesh) {
        manager.registerProvider(EffectFeature.FACE_MESH, providers.faceMesh)
      }
    }

    // Создаём контроллер эффектов
    this._controller = new EffectsController(context.mediaStreamService)
  }

  destroy(): void {
    this._controller?.destroy()
    this._controller = null
    this._pipeline = null
  }
}
