import { FaceMeshClient, FaceMeshWorkerConfig, FaceMeshWorkerResult } from './face-mesh.client'
import { BaseMLProvider, IBaseMLProviderOptions } from './baseML.provider'

/**
 * Опции для FaceMeshProvider
 */
export interface FaceMeshProviderOptions extends IBaseMLProviderOptions {
  /** Конфигурация инициализации (modelPath, wasmPath, delegate и т.д.) */
  config?: FaceMeshWorkerConfig
}

/**
 * FaceMeshProvider — обёртка над FaceMeshClient
 * с throttling, caching и anti-parallel защитой из BaseMLProvider
 */
export class FaceMeshProvider extends BaseMLProvider<FaceMeshWorkerConfig, FaceMeshWorkerResult> {
  private client = new FaceMeshClient()
  private initConfig: FaceMeshWorkerConfig

  constructor(options: FaceMeshProviderOptions = {}) {
    super(options)
    this.initConfig = options.config || {}
  }

  protected async onInitialize(config?: FaceMeshWorkerConfig): Promise<void> {
    await this.client.initialize(config || this.initConfig)
  }

  protected async onDetect(imageData: ImageData, timestamp: number): Promise<FaceMeshWorkerResult> {
    return this.client.detect(imageData, timestamp)
  }

  protected async onDispose(): Promise<void> {
    this.client.dispose()
  }
}
