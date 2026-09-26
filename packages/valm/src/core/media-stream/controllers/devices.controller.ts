import { DevicesChangeCallback, DevicesState } from '../../types'
import { PermissionsService } from '../../permissions'
import { ActiveDeviceIds, DefaultDeviceChangedCallback, DefaultDeviceChangedEvent, DeviceDisconnectedCallback, DeviceDisconnectedEvent } from '../device.types'

// Виртуальные записи enumerateDevices: не физические устройства
const isVirtualDeviceId = (id: string) => id === 'default' || id === 'communications' || id === ''
const sameDevice = (a: MediaDeviceInfo | null, b: MediaDeviceInfo | null) => a?.groupId === b?.groupId && a?.label === b?.label
import { AudioOutputController } from './audio-output.controller'

export class DevicesController {
  private callbacks = new Set<DevicesChangeCallback>()
  private disconnectedCallbacks = new Set<DeviceDisconnectedCallback>()
  private defaultChangedCallbacks = new Set<DefaultDeviceChangedCallback>()
  private cachedDevices: DevicesState = {
    cameras: [],
    microphones: [],
    speakers: [],
    defaults: { microphone: null, speaker: null, communicationsMicrophone: null },
  }
  // Уже отправленные onDeviceDisconnected (`kind:deviceId`) — по одному событию на переход «есть → нет»
  private reportedMissing = new Set<string>()
  private hasSnapshot = false
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
        const previousDefaults = this.hasSnapshot ? this.cachedDevices.defaults : null
        await this.getAvailable()
        this.checkDeviceDisconnection()
        if (previousDefaults) this.checkDefaultsChanged(previousDefaults)
        this._notifyChange(this.state)
      }

      navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener)
    }
  }

  getAvailable = async (): Promise<DevicesState> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()

      const find = (kind: MediaDeviceKind, id: string) => devices.find((d) => d.kind === kind && d.deviceId === id) ?? null

      this.cachedDevices = {
        cameras: devices.filter((device) => device.kind === 'videoinput' && device.deviceId !== 'default' && device.deviceId !== ''),
        microphones: devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== ''),
        speakers: devices.filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== ''),
        defaults: {
          microphone: find('audioinput', 'default'),
          speaker: find('audiooutput', 'default'),
          communicationsMicrophone: find('audioinput', 'communications'),
        },
      }
      this.hasSnapshot = true

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

      return this.cachedDevices
    } catch (error) {
      console.error('[DevicesController] Failed to get device list:', error)
      return this.cachedDevices
    }
  }

  // Только из devicechange. active — последнее открытое устройство (переживает 'ended'),
  // поэтому событие приходит при любом порядке ended/devicechange. Виртуальный 'default' не проверяется:
  // его смену сообщает onDefaultDeviceChanged
  private checkDeviceDisconnection(): void {
    if (!this.getActiveDeviceIds) return

    const active = this.getActiveDeviceIds()
    this.checkMissing('camera', active.camera, this.cachedDevices.cameras)
    this.checkMissing('microphone', active.microphone, this.cachedDevices.microphones)
  }

  private checkMissing(kind: DeviceDisconnectedEvent['kind'], deviceId: string | null, list: MediaDeviceInfo[]): void {
    if (!deviceId || isVirtualDeviceId(deviceId)) return

    const key = `${kind}:${deviceId}`
    if (list.some((d) => d.deviceId === deviceId)) {
      this.reportedMissing.delete(key)
      return
    }
    if (this.reportedMissing.has(key)) return

    this.reportedMissing.add(key)
    this.notifyDeviceDisconnected({ kind, deviceId })
  }

  private checkDefaultsChanged(previous: DevicesState['defaults']): void {
    const current = this.cachedDevices.defaults
    const changes: DefaultDeviceChangedEvent[] = []

    if (!sameDevice(previous.microphone, current.microphone)) {
      changes.push({ kind: 'microphone', previous: previous.microphone, current: current.microphone })
    }
    if (!sameDevice(previous.speaker, current.speaker)) {
      changes.push({ kind: 'speaker', previous: previous.speaker, current: current.speaker })
    }

    changes.forEach((event) => this.defaultChangedCallbacks.forEach((cb) => cb(event)))
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

  // ОС сменила системное устройство (запись 'default' указывает на другое физическое устройство)
  onDefaultDeviceChanged = (callback: DefaultDeviceChangedCallback): VoidFunction => {
    this.defaultChangedCallbacks.add(callback)
    return () => this.defaultChangedCallbacks.delete(callback)
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
    this.defaultChangedCallbacks.clear()
    this.reportedMissing.clear()
    this.hasAutoSelectedSpeaker = false
  }
}
