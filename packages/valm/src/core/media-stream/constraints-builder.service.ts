import { AudioConfiguration, VideoConfiguration } from '../configuration/configuration.types'
import { isIOS } from '../utils'

export class ConstraintsBuilderService {
  // Строит constraints для видео. На iOS — упрощённые (ideal вместо exact)
  static buildVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    if (isIOS()) {
      return this.buildIOSVideoConstraints(config)
    }
    return this.buildStandardVideoConstraints(config)
  }

  // Строит constraints для аудио
  static buildAudioConstraints(config: AudioConfiguration): MediaTrackConstraints {
    return {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      echoCancellation: config.echoCancellation,
      noiseSuppression: config.noiseSuppression,
      autoGainControl: config.autoGainControl,
      ...config.constraints,
    }
  }

  // iOS Safari: ideal вместо exact, deviceId ИЛИ facingMode (не оба)
  private static buildIOSVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {}

    // На iOS используем только deviceId ИЛИ facingMode, но не оба
    if (config.deviceId) {
      constraints.deviceId = { exact: config.deviceId }
    } else if (config.facingMode) {
      constraints.facingMode = { exact: config.facingMode }
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

  private static buildStandardVideoConstraints(config: VideoConfiguration): MediaTrackConstraints {
    return {
      deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
      facingMode: !config.deviceId && config.facingMode
        ? { exact: config.facingMode }
        : undefined,
      width: config.resolution.width,
      height: config.resolution.height,
      frameRate: config.frameRate,
      ...config.constraints,
    }
  }
}
