import { IMediaPlugin, PluginContext } from '../core'
import { EffectsController } from './effects.controller'
import { CustomProvidersConfig } from './pipeline/ml-providers-manager'
import { EffectFeature, PerformanceConfig } from './types'
import { VideoProcessingPipelineService } from './pipeline/video-processing-pipeline.service'

export interface EffectsPluginOptions {
  // Кастомные ML-провайдеры вместо встроенных MediaPipe
  providers?: CustomProvidersConfig

  // Performance preset и параметры (по умолчанию — 'medium')
  performance?: PerformanceConfig
}

export class EffectsPlugin implements IMediaPlugin {
  readonly name = 'effects'

  private _controller: EffectsController | null = null
  private _pipeline: VideoProcessingPipelineService | null = null
  private _options: EffectsPluginOptions

  constructor(options: EffectsPluginOptions = {}) {
    this._options = options
  }

  // Доступен после install()
  get controller(): EffectsController {
    if (!this._controller) {
      throw new Error('EffectsPlugin не установлен. Вызовите module.use(new EffectsPlugin()) перед использованием.')
    }
    return this._controller
  }

  get pipeline(): VideoProcessingPipelineService | null {
    return this._pipeline
  }

  get isInstalled(): boolean {
    return this._controller !== null
  }

  install(context: PluginContext): void {
    // Создаём pipeline и устанавливаем в видео-менеджер
    this._pipeline = new VideoProcessingPipelineService(
      this._options.performance ? { performance: this._options.performance } : undefined,
    )
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
