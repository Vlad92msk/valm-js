export interface DevicesState {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
  // Виртуальные записи 'default' (Chrome); в массивах выше их нет
  defaults: {
    microphone: MediaDeviceInfo | null
    speaker: MediaDeviceInfo | null
    // 'communications' на Windows
    communicationsMicrophone: MediaDeviceInfo | null
  }
}

export interface DeviceDisconnectedEvent {
  kind: 'camera' | 'microphone'
  deviceId: string
}

export type DeviceDisconnectedCallback = (event: DeviceDisconnectedEvent) => void

export interface DefaultDeviceChangedEvent {
  kind: 'microphone' | 'speaker'
  previous: MediaDeviceInfo | null
  current: MediaDeviceInfo | null
}

export type DefaultDeviceChangedCallback = (event: DefaultDeviceChangedEvent) => void

export interface ActiveDeviceIds {
  camera: string | null
  microphone: string | null
}

// Результат switchDevice: applied=false — смена не понадобилась или её вытеснил более новый вызов
export interface SwitchResult {
  applied: boolean
  deviceId: string | null
  reason?: 'noop' | 'superseded' | 'disabled'
}

// Результат toggleFacing: applied=true — открыта другая камера. У камер без признака стороны
// (ноутбук, внешняя веб-камера) браузер открывает ту же: applied=false, reason='noop'.
// facingMode — значение, записанное в конфиг
export interface FacingResult extends SwitchResult {
  facingMode: 'user' | 'environment'
}

export interface DeviceFallbackEvent {
  requestedDeviceId: string
  actualDeviceId: string | null
  reason: 'overconstrained' | 'not-found' | 'device-lost'
}

export interface SourceMuteChangeEvent {
  muted: boolean
  track: MediaStreamTrack
}

// Трек завершился не по disable(): 'device-lost' — устройства больше нет в enumerateDevices
export interface TrackEndedEvent {
  kind: 'audio' | 'video'
  reason: 'device-lost' | 'ended'
  deviceId: string | null
  groupId: string | null
  label: string
}
