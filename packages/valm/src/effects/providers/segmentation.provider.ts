import { SegmentationConfig, SegmentationResult, SegmentationService } from './segmentation.client'
import { BaseMLProvider, IBaseMLProviderOptions } from './baseML.provider'

/**
 * Опции для SegmentationProvider
 */
export interface SegmentationProviderOptions extends IBaseMLProviderOptions {
  /** Конфигурация инициализации (delegate, wasmPath, modelPath и т.д.) */
  config?: SegmentationConfig
}

/**
 * SegmentationProvider — обёртка над SegmentationService
 * с throttling, caching и anti-parallel защитой из BaseMLProvider
 */
export class SegmentationProvider extends BaseMLProvider<SegmentationConfig, SegmentationResult> {
  private service = new SegmentationService()
  private initConfig: SegmentationConfig

  constructor(options: SegmentationProviderOptions = {}) {
    super(options)
    this.initConfig = options.config || {}
  }

  protected async onInitialize(config?: SegmentationConfig): Promise<void> {
    await this.service.initialize(config || this.initConfig)
  }

  protected async onDetect(imageData: ImageData, timestamp: number): Promise<SegmentationResult> {
    return this.service.segment(imageData, timestamp)
  }

  protected async onDispose(): Promise<void> {
    this.service.dispose()
  }
}
