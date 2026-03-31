import { IMLProvider } from '../types'

export interface IBaseMLProviderOptions {
  minInterval?: number // ms
  cacheEnabled?: boolean
}

// Throttling, caching, anti-parallel. Наследники реализуют onInitialize/onDetect/onDispose
export abstract class BaseMLProvider<TConfig, TResult> implements IMLProvider<TConfig, TResult> {
  protected initialized = false
  protected lastCallTime = 0
  protected minInterval = 0

  protected pendingPromise: Promise<TResult> | null = null
  protected lastResult: TResult | null = null
  protected cacheEnabled = true

  constructor(options: IBaseMLProviderOptions = {}) {
    this.minInterval = options.minInterval ?? 0
    this.cacheEnabled = options.cacheEnabled ?? true
  }

  async initialize(config?: TConfig): Promise<void> {
    if (this.initialized) return
    await this.onInitialize(config)
    this.initialized = true
  }

  async detect(imageData: ImageData, timestamp = performance.now()): Promise<TResult> {
    if (!this.initialized) {
      throw new Error('Provider not initialized')
    }

    const now = timestamp
    const delta = now - this.lastCallTime

    // Throttle: возвращаем кэш
    if (this.cacheEnabled && delta < this.minInterval) {
      if (this.lastResult !== null) {
        return this.lastResult
      }
      // если нет lastResult — просто продолжаем (а не бросаем исключение)
    }

    // Anti-parallel: возвращаем текущий промис
    if (this.pendingPromise) {
      return this.pendingPromise
    }

    this.lastCallTime = now

    // Детекция
    this.pendingPromise = this.onDetect(imageData, timestamp)
      .then((res) => {
        this.lastResult = res
        return res
      })
      .finally(() => {
        this.pendingPromise = null
      })

    return this.pendingPromise
  }

  wouldReturnCache(): boolean {
    if (!this.cacheEnabled) return false
    const now = performance.now()
    return (now - this.lastCallTime) < this.minInterval && this.lastResult !== null
  }

  getLastResult(): TResult | null {
    return this.lastResult
  }

  isReady(): boolean {
    return this.initialized
  }

  clearCache(): void {
    this.lastResult = null
  }

  async dispose(): Promise<void> {
    await this.onDispose()
    this.initialized = false
    this.lastResult = null
    this.pendingPromise = null
  }

  protected abstract onInitialize(config?: TConfig): Promise<void>
  protected abstract onDetect(imageData: ImageData, timestamp: number): Promise<TResult>
  protected abstract onDispose(): Promise<void>
}
