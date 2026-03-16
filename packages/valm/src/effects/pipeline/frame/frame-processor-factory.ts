import { DeviceDetector } from '../../../core/utils/device-detector'
import type { FrameProcessorType, IFrameOutput, IFrameSource } from '../../types'
import { supportsInsertableStreams } from '../../types'
import { CanvasFrameOutput } from './canvas-frame-output'
import { CanvasFrameSource } from './canvas-frame-source'
import { InsertableFrameOutput } from './insertable-frame-output'
import { InsertableFrameSource } from './insertable-frame-source'

/**
 * Фабрика для создания FrameSource и FrameOutput
 */
export class FrameProcessorFactory {
  private static forcedType: FrameProcessorType | null = null

  /**
   * Проверить поддержку Insertable Streams
   */
  static supportsInsertableStreams(): boolean {
    return supportsInsertableStreams()
  }

  /**
   * Проверить реальную поддержку Insertable Streams (не просто наличие API)
   */
  private static canUseInsertableStreams(): boolean {
    // На мобильных устройствах НИКОГДА не используем Insertable Streams
    if (DeviceDetector.isMobile() || DeviceDetector.isIOS() || DeviceDetector.isSafari()) {
      return false
    }

    // Проверяем наличие API
    if (!supportsInsertableStreams()) return false

    // Дополнительная проверка: есть ли конструкторы?
    try {
      const hasProcessor = typeof MediaStreamTrackProcessor !== 'undefined'
      const hasGenerator = typeof MediaStreamTrackGenerator !== 'undefined'
      return hasProcessor && hasGenerator
    } catch {
      return false
    }
  }

  /**
   * Получить текущий тип (с учётом forced и платформы)
   */
  static getCurrentType(): FrameProcessorType {
    if (this.forcedType) return this.forcedType

    // На мобильных ВСЕГДА используем canvas
    if (!this.canUseInsertableStreams()) {
      return 'canvas'
    }

    return 'insertable-streams'
  }

  /**
   * Принудительно установить тип (для тестирования)
   */
  static forceType(type: FrameProcessorType | null): void {
    this.forcedType = type
  }

  /**
   * Создать FrameSource
   */
  static createSource(type?: FrameProcessorType): IFrameSource {
    const effectiveType = type ?? this.getCurrentType()

    if (effectiveType === 'insertable-streams' && this.canUseInsertableStreams()) {
      return new InsertableFrameSource()
    }

    return new CanvasFrameSource()
  }

  /**
   * Создать FrameOutput
   */
  static createOutput(type?: FrameProcessorType): IFrameOutput {
    const effectiveType = type ?? this.getCurrentType()

    if (effectiveType === 'insertable-streams' && this.canUseInsertableStreams()) {
      return new InsertableFrameOutput()
    }

    return new CanvasFrameOutput()
  }

  /**
   * Диагностическая информация
   */
  static getDiagnostics(): {
    isMobile: boolean
    isIOS: boolean
    isSafari: boolean
    supportsInsertableStreams: boolean
    canUseInsertableStreams: boolean
    currentType: FrameProcessorType
  } {
    return {
      isMobile: DeviceDetector.isMobile(),
      isIOS: DeviceDetector.isIOS(),
      isSafari: DeviceDetector.isSafari(),
      supportsInsertableStreams: supportsInsertableStreams(),
      canUseInsertableStreams: this.canUseInsertableStreams(),
      currentType: this.getCurrentType(),
    }
  }
}
