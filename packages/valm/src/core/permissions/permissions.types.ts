export type MediaPermissionType = 'camera' | 'microphone'

export type MediaPermissionState = PermissionState | 'unknown'

export interface MediaPermissions {
  camera: MediaPermissionState
  microphone: MediaPermissionState
}

export type PermissionChangeCallback = (state: MediaPermissionState) => void
