import { DeviceFallbackMode } from '../configuration/configuration.types'
import { DeviceFallbackEvent } from './device.types'

// Устройства нет: OverconstrainedError по deviceId или NotFoundError. NotReadableError (занято) сюда не относится
export function getMissingDeviceReason(error: unknown): 'overconstrained' | 'not-found' | null {
  if (!error || typeof error !== 'object') return null
  const { name, constraint } = error as { name?: string; constraint?: string }
  if (name === 'NotFoundError') return 'not-found'
  if (name === 'OverconstrainedError' && constraint === 'deviceId') return 'overconstrained'
  return null
}

export interface UserMediaResult {
  stream: MediaStream
  fallback: DeviceFallbackEvent | null
}

// getUserMedia с опциональным откатом на системное устройство, если выбранного нет
export async function getUserMediaWithFallback(
  kind: 'audio' | 'video',
  constraints: MediaTrackConstraints,
  requestedDeviceId: string | null | undefined,
  mode: DeviceFallbackMode | undefined,
): Promise<UserMediaResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ [kind]: constraints })
    return { stream, fallback: null }
  } catch (error) {
    const reason = getMissingDeviceReason(error)
    if (!reason || !requestedDeviceId || mode !== 'default') throw error

    const { deviceId: _omit, ...rest } = constraints
    const stream = await navigator.mediaDevices.getUserMedia({ [kind]: rest })
    const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]

    return {
      stream,
      fallback: { requestedDeviceId, actualDeviceId: track?.getSettings().deviceId ?? null, reason },
    }
  }
}
