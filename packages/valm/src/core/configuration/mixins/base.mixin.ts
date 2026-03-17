import { ConfigurationChangeEvent, ValmConfiguration } from '../../types'
import { AudioEvents, VideoEvents } from '../../media-stream'
import { RecordingEvents } from '../../recording'
import { ScreenShareEvents } from '../../screen-share'
import { TranscriptionEvents } from '../../transcription'
import { TypedEventEmitter } from '../../utils'

export type Constructor<T = object> = new (...args: any[]) => T

export interface BaseEvents extends Record<string, (...args: any[]) => void> {
  configurationChanged: (event: ConfigurationChangeEvent) => void
  configReset: (data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => void
  configImported: (data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => void
  // Динамические события вида `${section}ConfigChanged`
  [key: `${string}ConfigChanged`]: (event: ConfigurationChangeEvent) => void
}

type AllEvents = VideoEvents & AudioEvents & RecordingEvents & BaseEvents & ScreenShareEvents & TranscriptionEvents

export class BaseConfigurationService extends TypedEventEmitter<AllEvents> {
  protected config: Record<string, any> = {}
  protected validators = new Map<string, (value: any) => boolean>()

  private _defaultConfigCache: Record<string, any> | null = null

  constructor(initialConfig: Record<string, any> = {}) {
    super()
    const defaultConfig = this.getCachedDefaultConfig()

    this.config = this.deepMerge(defaultConfig, initialConfig)

    this.setupValidators()
  }

  protected getCachedDefaultConfig(): Record<string, any> {
    if (this._defaultConfigCache === null) {
      this._defaultConfigCache = this.getDefaultConfig()
    }
    return this.deepClone(this._defaultConfigCache)
  }

  protected getDefaultConfig(): Record<string, any> {
    return {}
  }

  // Точка расширения — миксины добавляют свои валидаторы через override
  protected setupValidators(): void {}

  protected validateAndSet(path: string, value: any): void {
    const validator = this.validators.get(path)
    if (validator && !validator(value)) {
      throw new Error(`Invalid value for ${path}: ${value}`)
    }
  }

  protected emitChange<T>(section: string, property: string, oldValue: T, newValue: T): void {
    const changeEvent: ConfigurationChangeEvent = {
      //@ts-ignore
      section,
      property,
      oldValue,
      newValue,
      timestamp: Date.now(),
    }

    this.emit('configurationChanged', changeEvent)
    this.emit(`${section}ConfigChanged`, changeEvent)
  }

  protected deepClone<T>(obj: T): T {
    return structuredClone(obj)
  }

  protected deepMerge(target: any, source: any): any {
    // Если source не объект, возвращаем его (примитивные значения)
    if (source === null || source === undefined) {
      return target
    }

    // Если source не объект (примитив), возвращаем его
    if (typeof source !== 'object' || Array.isArray(source)) {
      return source
    }

    // Создаём результат на основе target
    const result = { ...target }

    // Перебираем ключи source
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue
      }

      const sourceValue = source[key]
      const targetValue = target?.[key]

      // Если значение в source - объект и не массив
      if (sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        // Если в target тоже объект - рекурсивно мержим
        if (targetValue !== null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          result[key] = this.deepMerge(targetValue, sourceValue)
        } else {
          // Если в target не объект - берём значение из source
          result[key] = this.deepClone(sourceValue)
        }
      } else {
        // Примитивное значение или массив - просто присваиваем
        result[key] = sourceValue
      }
    }

    return result
  }
}
