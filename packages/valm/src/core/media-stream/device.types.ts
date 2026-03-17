export interface DevicesState {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
}

export interface DeviceDisconnectedEvent {
  kind: 'camera' | 'microphone'
  deviceId: string
}

export type DeviceDisconnectedCallback = (event: DeviceDisconnectedEvent) => void

export interface ActiveDeviceIds {
  camera: string | null
  microphone: string | null
}
