/**
 * Хелпер для работы с медиа на iOS
 * Решает проблемы с разрешениями и getUserMedia
 *
 * Device detection delegated to DeviceDetector (single source of truth).
 */
import { DeviceDetector } from './device-detector'

export const isIOS = (): boolean => DeviceDetector.isIOS()

export const isIOSSafari = (): boolean => DeviceDetector.isIOSSafari()

export const isIOSChrome = (): boolean => DeviceDetector.isIOSChrome()

/**
 * На iOS Safari требуется user gesture для первого запроса getUserMedia
 * Этот метод нужно вызывать в обработчике клика/тапа
 */
export const requestIOSMediaPermissions = async (): Promise<{
  video: boolean
  audio: boolean
}> => {
  const result = { video: false, audio: false }

  try {
    // Запрашиваем минимальные разрешения для получения permissions
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true,
    })

    // Сразу останавливаем треки
    stream.getTracks().forEach((track) => track.stop())

    result.video = true
    result.audio = true
  } catch (error) {
    console.warn('Failed to request iOS media permissions:', error)
  }

  return result
}

/**
 * Проверяет, были ли получены разрешения на медиа
 */
export const checkIOSMediaPermissions = async (): Promise<{
  video: 'granted' | 'denied' | 'prompt' | 'unknown'
  audio: 'granted' | 'denied' | 'prompt' | 'unknown'
}> => {
  try {
    // На iOS нет Permissions API для камеры/микрофона
    // Пробуем получить список устройств
    const devices = await navigator.mediaDevices.enumerateDevices()

    // Если есть labels - разрешения получены
    const hasLabels = devices.some((device) => device.label !== '')

    if (hasLabels) {
      return { video: 'granted', audio: 'granted' }
    }

    return { video: 'prompt', audio: 'prompt' }
  } catch (error) {
    return { video: 'unknown', audio: 'unknown' }
  }
}

/**
 * Получает список доступных камер на iOS
 * Важно: требует предварительного получения разрешений
 */
export const getIOSCameras = async (): Promise<MediaDeviceInfo[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((device) => device.kind === 'videoinput' && device.deviceId !== 'default')
  } catch (error) {
    console.warn('Failed to get iOS cameras:', error)
    return []
  }
}

/**
 * Определяет, является ли камера фронтальной или задней по facingMode
 */
export const getCameraFacingMode = (track: MediaStreamTrack): 'user' | 'environment' | 'unknown' => {
  const settings = track.getSettings()
  return (settings.facingMode as 'user' | 'environment') || 'unknown'
}

/**
 * Создает оптимальные constraints для iOS
 */
export const createIOSVideoConstraints = (options: {
  facingMode?: 'user' | 'environment'
  deviceId?: string
  width?: number
  height?: number
  frameRate?: number
}): MediaTrackConstraints => {
  const constraints: MediaTrackConstraints = {}

  // На iOS используем ЛИБО deviceId, ЛИБО facingMode
  if (options.deviceId) {
    constraints.deviceId = { exact: options.deviceId }
  } else if (options.facingMode) {
    constraints.facingMode = options.facingMode
  }

  // Используем ideal вместо exact для разрешения
  if (options.width) {
    constraints.width = { ideal: options.width }
  }
  if (options.height) {
    constraints.height = { ideal: options.height }
  }
  if (options.frameRate) {
    constraints.frameRate = { ideal: options.frameRate }
  }

  return constraints
}

/**
 * Ожидает небольшую задержку (нужно для стабильности на iOS Safari)
 */
export const waitForIOSMediaStability = (ms: number = 100): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Безопасное переключение камеры на iOS
 * Полностью останавливает старый трек перед созданием нового
 */
export const switchIOSCamera = async (currentTrack: MediaStreamTrack | null, newConstraints: MediaTrackConstraints): Promise<MediaStreamTrack> => {
  // Останавливаем текущий трек
  if (currentTrack) {
    currentTrack.stop()
  }

  // Даем iOS время освободить ресурсы
  await waitForIOSMediaStability(150)

  // Получаем новый стрим
  const stream = await navigator.mediaDevices.getUserMedia({
    video: newConstraints,
  })

  return stream.getVideoTracks()[0]
}

/**
 * Хук для React-компонента, который запрашивает разрешения при монтировании
 */
export const useIOSMediaPermissions = () => {
  if (typeof window === 'undefined') return null

  return {
    isIOS: isIOS(),
    isIOSSafari: isIOSSafari(),
    isIOSChrome: isIOSChrome(),
    requestPermissions: requestIOSMediaPermissions,
    checkPermissions: checkIOSMediaPermissions,
  }
}

/**
 * Обработчик ошибок для iOS
 */
export const handleIOSMediaError = (
  error: any,
): {
  type: 'permission' | 'not-found' | 'constraint' | 'unknown'
  message: string
  userMessage: string
} => {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return {
      type: 'permission',
      message: error.message,
      userMessage: 'Доступ к камере запрещен. Разрешите доступ в настройках Safari.',
    }
  }

  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return {
      type: 'not-found',
      message: error.message,
      userMessage: 'Камера не найдена на этом устройстве.',
    }
  }

  if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
    return {
      type: 'constraint',
      message: error.message,
      userMessage: 'Не удалось применить настройки камеры. Попробуйте другие параметры.',
    }
  }

  return {
    type: 'unknown',
    message: error.message || 'Unknown error',
    userMessage: 'Произошла ошибка при работе с камерой.',
  }
}
