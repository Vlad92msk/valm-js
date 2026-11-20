import { SegmentationConfig, SegmentationResult, SegmentationService, SegmentationSource } from './segmentation.client'
import { BaseMLProvider, IBaseMLProviderOptions } from './baseML.provider'

export interface SegmentationProviderOptions extends IBaseMLProviderOptions {
  config?: SegmentationConfig
}

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

  // Кадр прямо из canvas/VideoFrame — без ImageData (см. MLProvidersManager.detectFromSource)
  detectSource(source: SegmentationSource, width: number, height: number, timestamp = performance.now()): Promise<SegmentationResult> {
    return this.runDetection(timestamp, async () => this.service.segmentSource(source, width, height, timestamp))
  }

  protected async onDispose(): Promise<void> {
    this.service.dispose()
  }
}
