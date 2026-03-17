import { EffectFeature, EffectType, FrameContext, IVideoEffect } from '../types'

export abstract class BaseEffect<TParams extends object = Record<string, unknown>> implements IVideoEffect<TParams> {
  abstract readonly name: string
  abstract readonly type: EffectType
  abstract readonly requiredFeatures: EffectFeature[]

  protected enabled = true
  protected params: TParams

  constructor(defaultParams: TParams) {
    this.params = { ...defaultParams }
  }

  // Переопределить в наследнике для async инициализации
  async initialize(): Promise<void> {
    // По умолчанию ничего не делаем
  }

  abstract apply(ctx: FrameContext): void

  updateParams(params: Partial<TParams>): void {
    this.params = { ...this.params, ...params }
    this.onParamsUpdated()
  }

  getParams(): TParams {
    return { ...this.params }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  // Переопределить в наследнике для очистки ресурсов
  dispose(): void {
    // По умолчанию ничего не делаем
  }

  // Хук — вызывается после updateParams()
  protected onParamsUpdated(): void {
    // По умолчанию ничего не делаем
  }
}
