import { EffectFeature, EffectType, FrameContext, IVideoEffect } from '../types'

/**
 * BaseEffect — абстрактный базовый класс для видео эффектов
 *
 * Предоставляет:
 * - Управление enabled/disabled состоянием
 * - Базовую структуру для параметров
 * - Шаблон для наследования
 */
export abstract class BaseEffect<TParams extends object = Record<string, unknown>> implements IVideoEffect<TParams> {
  abstract readonly name: string
  abstract readonly type: EffectType
  abstract readonly requiredFeatures: EffectFeature[]

  protected enabled = true
  protected params: TParams

  constructor(defaultParams: TParams) {
    this.params = { ...defaultParams }
  }

  /**
   * Инициализация эффекта
   * Переопределить в наследнике если нужна async инициализация
   */
  async initialize(): Promise<void> {
    // По умолчанию ничего не делаем
  }

  /**
   * Применить эффект к кадру
   * ОБЯЗАТЕЛЬНО переопределить в наследнике
   */
  abstract apply(ctx: FrameContext): void

  /**
   * Обновить параметры
   */
  updateParams(params: Partial<TParams>): void {
    this.params = { ...this.params, ...params }
    this.onParamsUpdated()
  }

  /**
   * Получить текущие параметры
   */
  getParams(): TParams {
    return { ...this.params }
  }

  /**
   * Включён ли эффект
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Включить/выключить эффект
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Освободить ресурсы
   * Переопределить в наследнике если нужна очистка
   */
  dispose(): void {
    // По умолчанию ничего не делаем
  }

  /**
   * Вызывается после обновления параметров
   * Переопределить в наследнике если нужна реакция на изменение параметров
   */
  protected onParamsUpdated(): void {
    // По умолчанию ничего не делаем
  }
}
