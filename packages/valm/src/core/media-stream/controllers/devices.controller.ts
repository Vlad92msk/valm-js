import { DevicesChangeCallback, DevicesState } from '../../types'
import { PermissionsService } from '../../permissions'
import { ActiveDeviceIds, DeviceDisconnectedCallback, DeviceDisconnectedEvent } from '../device.types'
import { AudioOutputController } from './audio-output.controller'

export class DevicesController {
  private callbacks = new Set<DevicesChangeCallback>()
  private disconnectedCallbacks = new Set<DeviceDisconnectedCallback>()
  private cachedDevices: DevicesState = {
    cameras: [],
    microphones: [],
    speakers: [],
  }
  private deviceChangeListener: VoidFunction | null = null
  private audioOutputController?: AudioOutputController
  private hasAutoSelectedSpeaker = false
  private getActiveDeviceIds?: () => ActiveDeviceIds
  private permissionsService?: PermissionsService

  constructor(audioOutputController?: AudioOutputController, getActiveDeviceIds?: () => ActiveDeviceIds, permissionsService?: PermissionsService) {
    this.audioOutputController = audioOutputController
    this.getActiveDeviceIds = getActiveDeviceIds
    this.permissionsService = permissionsService
    this.setupDeviceChangeListener()
  }

  private setupDeviceChangeListener(): void {
    if (typeof window !== 'undefined' && navigator.mediaDevices) {
      this.deviceChangeListener = async () => {
        await this.getAvailable()
        this._notifyChange(this.state)
      }

      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener)
    }
  }

  getAvailable = async (): Promise<DevicesState> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()

      this.cachedDevices = {
        cameras: devices.filter((device) => device.kind === 'videoinput' && device.deviceId !== 'default' && device.deviceId !== ''),
        microphones: devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== ''),
        speakers: devices.filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== ''),
      }

      // Обновляем список доступных устройств в AudioOutputController
      if (this.audioOutputController) {
        this.audioOutputController.setAvailableDevices(this.cachedDevices.speakers)

        // Автоматически выбираем speakerphone при первом получении списка
        if (!this.hasAutoSelectedSpeaker && this.cachedDevices.speakers.length > 0) {
          const success = await this.audioOutputController.autoSelectSpeakerphone()
          if (success) {
            this.hasAutoSelectedSpeaker = true
          }
        }
      }

      this.checkDeviceDisconnection()

      return this.cachedDevices
    } catch (error) {
      console.error('[DevicesController] Failed to get device list:', error)
      return this.cachedDevices
    }
  }

  private checkDeviceDisconnection(): void {
    if (!this.getActiveDeviceIds || this.disconnectedCallbacks.size === 0) return

    const active = this.getActiveDeviceIds()

    if (active.camera) {
      const cameraExists = this.cachedDevices.cameras.some((d) => d.deviceId === active.camera)
      if (!cameraExists) {
        this.notifyDeviceDisconnected({ kind: 'camera', deviceId: active.camera })
      }
    }

    if (active.microphone) {
      const micExists = this.cachedDevices.microphones.some((d) => d.deviceId === active.microphone)
      if (!micExists) {
        this.notifyDeviceDisconnected({ kind: 'microphone', deviceId: active.microphone })
      }
    }
  }

  private notifyDeviceDisconnected(event: DeviceDisconnectedEvent): void {
    this.disconnectedCallbacks.forEach((cb) => cb(event))
  }

  getCurrentAudioOutput = (audioElement: HTMLAudioElement): string => {
    return (audioElement as any).sinkId || 'default'
  }

  checkPermissions = async () => {
    if (this.permissionsService) {
      return this.permissionsService.checkAll()
    }

    try {
      const cameraPermission = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      })
      const microphonePermission = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      })

      return {
        camera: cameraPermission.state,
        microphone: microphonePermission.state,
      }
    } catch {
      return {
        camera: 'unknown' as const,
        microphone: 'unknown' as const,
      }
    }
  }

  onChange = (callback: DevicesChangeCallback): (() => void) => {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  onDeviceDisconnected = (callback: DeviceDisconnectedCallback): VoidFunction => {
    this.disconnectedCallbacks.add(callback)
    return () => this.disconnectedCallbacks.delete(callback)
  }

  _notifyChange(devices: DevicesState): void {
    this.cachedDevices = devices
    this.callbacks.forEach((callback) => callback(devices))
  }

  get state(): DevicesState {
    return this.cachedDevices
  }

  async _updateCache(): Promise<void> {
    await this.getAvailable()
  }

  destroy(): void {
    if (this.deviceChangeListener && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener)
      this.deviceChangeListener = null
    }
    this.callbacks.clear()
    this.disconnectedCallbacks.clear()
    this.hasAutoSelectedSpeaker = false
  }
}
