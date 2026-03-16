import { ConfigurationService } from './configuration/configuration.service'
import { MediaStreamService } from './media-stream/media-stream.service'

/**
 * Контекст, передаваемый плагину при установке.
 * Предоставляет доступ к внутренним сервисам модуля.
 */
export interface PluginContext {
  mediaStreamService: MediaStreamService
  configurationService: ConfigurationService
}

/**
 * Интерфейс плагина для Valm.
 *
 * Плагины расширяют функциональность модуля без создания жёстких зависимостей.
 * Пример: EffectsPlugin добавляет видео-эффекты (blur, виртуальный фон),
 * но потребители, которым эффекты не нужны, не загружают тяжёлые ML-зависимости.
 */
export interface IMediaPlugin {
  /** Уникальное имя плагина */
  readonly name: string

  /** Установка плагина — вызывается из module.use() */
  install(context: PluginContext): void

  /** Освобождение ресурсов — вызывается из module.destroy() */
  destroy(): void
}
