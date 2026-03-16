import { DeviceDetector } from '../utils/device-detector'
import { MediaPermissions, MediaPermissionState, MediaPermissionType, PermissionChangeCallback } from './permissions.types'

export class PermissionsService {
  private permissionStatuses = new Map<MediaPermissionType, PermissionStatus>()
  private callbacks = new Map<MediaPermissionType, Set<PermissionChangeCallback>>()
  private changeHandlers = new Map<MediaPermissionType, () => void>()

  constructor() {
    this.callbacks.set('camera', new Set())
    this.callbacks.set('microphone', new Set())
  }

  async checkPermission(type: MediaPermissionType): Promise<MediaPermissionState> {
    // На iOS нет Permissions API для камеры/микрофона — используем fallback
    if (DeviceDetector.isIOS()) {
      return this.checkPermissionViaDevices(type)
    }

    try {
      const permissionName = type === 'camera' ? 'camera' : 'microphone'
      const status = await navigator.permissions.query({ name: permissionName as PermissionName })

      // Сохраняем status для подписки на изменения
      if (!this.permissionStatuses.has(type)) {
        this.permissionStatuses.set(type, status)
        this.setupChangeListener(type, status)
      }

      return status.state
    } catch {
      return this.checkPermissionViaDevices(type)
    }
  }

  async checkAll(): Promise<MediaPermissions> {
    const [camera, microphone] = await Promise.all([this.checkPermission('camera'), this.checkPermission('microphone')])
    return { camera, microphone }
  }

  async requestPermission(type: MediaPermissionType): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints = type === 'camera' ? { video: true } : { audio: true }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch {
      return false
    }
  }

  async requestAll(): Promise<{ camera: boolean; microphone: boolean }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return { camera: true, microphone: true }
    } catch {
      // Если совместный запрос не удался — пробуем по отдельности
      const [camera, microphone] = await Promise.all([this.requestPermission('camera'), this.requestPermission('microphone')])
      return { camera, microphone }
    }
  }

  onPermissionChange(type: MediaPermissionType, callback: PermissionChangeCallback): VoidFunction {
    const typeCallbacks = this.callbacks.get(type)!
    typeCallbacks.add(callback)

    // Инициируем подписку на PermissionStatus если ещё не сделано
    if (!this.permissionStatuses.has(type)) {
      this.checkPermission(type)
    }

    return () => {
      typeCallbacks.delete(callback)
    }
  }

  private setupChangeListener(type: MediaPermissionType, status: PermissionStatus): void {
    if (this.changeHandlers.has(type)) return

    const handler = () => {
      const newState = status.state
      const typeCallbacks = this.callbacks.get(type)
      typeCallbacks?.forEach((cb) => cb(newState))
    }

    status.addEventListener('change', handler)
    this.changeHandlers.set(type, handler)
  }

  // Fallback: определяем разрешения через наличие label в enumerateDevices
  private async checkPermissionViaDevices(type: MediaPermissionType): Promise<MediaPermissionState> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const kind = type === 'camera' ? 'videoinput' : 'audioinput'
      const relevantDevices = devices.filter((d) => d.kind === kind)

      if (relevantDevices.length === 0) return 'denied'
      const hasLabels = relevantDevices.some((d) => d.label !== '')
      return hasLabels ? 'granted' : 'prompt'
    } catch {
      return 'unknown'
    }
  }

  destroy(): void {
    // Снимаем слушатели с PermissionStatus
    for (const [type, status] of this.permissionStatuses) {
      const handler = this.changeHandlers.get(type)
      if (handler) {
        status.removeEventListener('change', handler)
      }
    }

    this.permissionStatuses.clear()
    this.changeHandlers.clear()
    this.callbacks.get('camera')?.clear()
    this.callbacks.get('microphone')?.clear()
  }
}
