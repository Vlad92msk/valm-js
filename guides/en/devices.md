# DevicesController & AudioOutputController

Managing the device list, selecting a speaker, and handling device disconnection.

## DevicesController

### Access

```typescript
const devices = media.devicesController;
```

### Getting the device list

```typescript
const available = await devices.getAvailable();

available.cameras.forEach(cam => {
  const option = new Option(cam.label, cam.deviceId);
  cameraSelect.add(option);
});
```

### `DevicesState`

```typescript
interface DevicesState {
  cameras: MediaDeviceInfo[]      // video devices
  microphones: MediaDeviceInfo[]  // audio inputs
  speakers: MediaDeviceInfo[]     // audio outputs
}
```

`MediaDeviceInfo` is the standard browser type: `deviceId`, `label`, `kind`, `groupId`.

### Checking permissions

```typescript
const perms = await devices.checkPermissions();
// { camera: 'granted' | 'denied' | 'prompt', microphone: ... }
```

### Current sink of an audio element

```typescript
// getCurrentAudioOutput(audioElement: HTMLAudioElement)
const sinkId = devices.getCurrentAudioOutput(audioElement);
// Returns the element's sinkId or 'default'
```

### State

```typescript
const state = devices.state;
// { cameras[], microphones[], speakers[] }
```

### Subscriptions

```typescript
// Device list changes (connect/disconnect)
const unsub = devices.onChange((state: DevicesState) => {
  rebuildDeviceList(state);
});

devices.onDeviceDisconnected(({ kind, deviceId }: DeviceDisconnectedEvent) => {
  console.warn(`${kind} disconnected: ${deviceId}`);
});

unsub();
```

### `DeviceDisconnectedEvent`

```typescript
interface DeviceDisconnectedEvent {
  kind: 'camera' | 'microphone'  // type of the disconnected device
  deviceId: string               // ID of the disconnected device
}
```

The event fires only for active devices — those currently in use by the camera or microphone.

---

## AudioOutputController

Managing the output audio device (speaker/headphones).

### Access

```typescript
const audioOutput = media.audioOutputController;
```

### Selecting a speaker

```typescript
// Check support
if (audioOutput.isOutputSelectionSupported()) {
  await audioOutput.setOutputDevice('speaker-device-id');
}
```

### Registering audio elements

All registered elements switch automatically when the output device changes:

```typescript
const unregister = audioOutput.registerAudioElement(audioElement);

// Or a video element
const unregister2 = audioOutput.registerAudioElement(videoElement);

// Unregister
unregister();
```

### Test sound

```typescript
// 440Hz sine wave
await audioOutput.playTestSound();

// Or your own file
await audioOutput.playTestSound({
  url: '/sounds/test-tone.mp3',
  duration: 3, // seconds, defaults to 2
});
```

### Auto-selecting the speaker (mobile)

```typescript
const success = await audioOutput.autoSelectSpeakerphone();
```

### Subscription

```typescript
audioOutput.onChange((state: AudioOutputState) => {
  console.log('Output device:', state.deviceId);
});
```

### `AudioOutputState`

```typescript
interface AudioOutputState {
  deviceId: string  // ID of the selected output device or 'default'
}
```

`onChange` immediately invokes the callback with the current state on subscription.

---

## Common scenarios

### Device settings before a call

```typescript
const { cameras, microphones, speakers } = await devices.getAvailable();

// Populate the selects
cameras.forEach(d => cameraSelect.add(new Option(d.label, d.deviceId)));
microphones.forEach(d => micSelect.add(new Option(d.label, d.deviceId)));
speakers.forEach(d => speakerSelect.add(new Option(d.label, d.deviceId)));

// Switch camera
cameraSelect.onchange = () => media.cameraController.switchDevice(cameraSelect.value);

// Switch microphone
micSelect.onchange = () => media.microphoneController.switchDevice(micSelect.value);

// Switch speaker
speakerSelect.onchange = () => audioOutput.setOutputDevice(speakerSelect.value);

// Test speaker
testBtn.onclick = () => audioOutput.playTestSound();
```

### Handling device disconnection

```typescript
devices.onDeviceDisconnected(({ kind, deviceId }) => {
  showNotification(`${kind === 'camera' ? 'Camera' : 'Microphone'} disconnected`);

  // Auto-switch to another device
  if (kind === 'camera' && devices.state.cameras.length > 0) {
    media.cameraController.switchDevice(devices.state.cameras[0].deviceId);
  }
});
```

## API — DevicesController

| Method | Returns | Description |
|--------|---------|-------------|
| `getAvailable()` | `Promise<DevicesState>` | List of all devices |
| `checkPermissions()` | `Promise<{camera, microphone}>` | Check permissions |
| `getCurrentAudioOutput(el)` | `string` | Audio element's sinkId or `'default'` |
| `onChange(cb)` | `VoidFunction` | Subscribe to list changes |
| `onDeviceDisconnected(cb)` | `VoidFunction` | Subscribe to disconnection |
| `state` | `DevicesState` | Current state |

## API — AudioOutputController

| Method | Returns | Description |
|--------|---------|-------------|
| `setOutputDevice(deviceId)` | `Promise<void>` | Select a speaker |
| `registerAudioElement(el)` | `VoidFunction` | Register an element |
| `playTestSound(opts?)` | `Promise<void>` | Play a test sound |
| `autoSelectSpeakerphone()` | `Promise<boolean>` | Auto-select speaker (mobile) |
| `isOutputSelectionSupported()` | `boolean` | setSinkId support |
| `getOutputState()` | `AudioOutputState` | Output state |
| `onChange(cb)` | `VoidFunction` | Subscribe to changes |
