import { AudioConfiguration, VideoConfiguration } from '../configuration/configuration.types'
import { isIOS } from '../utils/ios-media.helper'

/**
 * Stateless builder для создания MediaTrackConstraints
 *
 * Инкапсулирует:
 * - Платформо-специфичную логику (iOS workarounds)
 * - Преобразование конфига приложения в Web API constraints
 *
 * @example
 * ```typescript
 * const videoConfig = configService.getVideoConfig()
 * const constraints = ConstraintsBuilderService.buildVideoConstraints(videoConfig)
 * const stream = await navigator.mediaDevices.getUserMedia({ video: constraints })
 * ```
 */
export class ConstraintsBuilderService {
  /**
   * Строит constraints для видео трека
   *
   * На iOS использует упрощённые constraints:
   * - Только `ideal` вместо `exact` для разрешения
   * - Либо deviceId, либо facingMode (не оба одновременно)
   */
  static buildVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    if (isIOS()) {
      return this.buildIOSVideoConstraints(config)
    }
    return this.buildStandardVideoConstraints(config)
  }

  /**
   * Строит constraints для аудио трека
   * Одинаковые для всех платформ
   */
  static buildAudioConstraints(config: AudioConfiguration): MediaTrackConstraints {
    return {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      echoCancellation: config.echoCancellation,
      noiseSuppression: config.noiseSuppression,
      autoGainControl: config.autoGainControl,
      ...config.constraints,
    }
  }

  /**
   * iOS-специфичные constraints
   *
   * Особенности iOS Safari:
   * 1. Не поддерживает `exact` для разрешения — используем `ideal`
   * 2. Конфликт deviceId + facingMode — используем только один
   * 3. Более строгие ограничения на комбинации параметров
   */
  private static buildIOSVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {}

    // На iOS используем только deviceId ИЛИ facingMode, но не оба
    if (config.deviceId) {
      constraints.deviceId = { exact: config.deviceId }
    } else if (config.facingMode) {
      constraints.facingMode = config.facingMode
    }

    // На iOS не используем exact для разрешения, только ideal
    if (config.resolution.width && config.resolution.height) {
      constraints.width = { ideal: config.resolution.width }
      constraints.height = { ideal: config.resolution.height }
    }

    if (config.frameRate) {
      constraints.frameRate = { ideal: config.frameRate }
    }

    return constraints
  }

  /**
   * Стандартные constraints для Chrome, Firefox и других браузеров
   */
  private static buildStandardVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    return {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      facingMode: config.facingMode,
      width: config.resolution.width,
      height: config.resolution.height,
      frameRate: config.frameRate,
      ...config.constraints,
    }
  }
}
