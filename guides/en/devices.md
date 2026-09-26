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
  // Virtual 'default' entries (Chrome); they are not in the arrays above
  defaults: {
    microphone: MediaDeviceInfo | null           // "Default - <device>"
    speaker: MediaDeviceInfo | null
    communicationsMicrophone: MediaDeviceInfo | null  // 'communications' (Windows)
  }
}
```

Use `defaults.microphone.label` to show a "Default — AirPods" option in a selector.

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

// The OS switched the system input/output (e.g. AirPods connected)
devices.onDefaultDeviceChanged(({ kind, previous, current }: DefaultDeviceChangedEvent) => {
  console.log(`${kind}: ${previous?.label} → ${current?.label}`);
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

The event fires only on `devicechange`, for the device last opened by the camera or microphone — including when its track has already ended. It fires once per "present → missing" transition. Virtual `'default'` is not checked: its switch is reported by `onDefaultDeviceChanged` (and the microphone can follow it automatically with `audio.followSystemDefault: true`). Calling `getAvailable()` never fires it.

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
  const applied = await audioOutput.setOutputDevice('speaker-device-id');
  if (!applied) showError('Speaker is unavailable'); // details in onError
}

// System output: null or 'default' (passed to setSinkId as '' — works in Firefox/Safari too)
await audioOutput.setOutputDevice(null);
```

`setOutputDevice` resolves to `false` without changing the state if the id is unknown (the list is fetched silently if it is empty) or if `setSinkId` failed on every registered element.

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

audioOutput.onError(({ action, deviceId, error }) => { /* setOutputDevice / registerAudioElement */ });

// The selected output disappeared: sound goes to the system output until it comes back
audioOutput.onDeviceLost(({ deviceId }) => { /* state.isFallback === true */ });
```

### `AudioOutputState`

```typescript
interface AudioOutputState {
  deviceId: string                 // actually applied output or 'default'
  preferredDeviceId: string | null // user's choice (kept while the device is unplugged)
  isFallback: boolean              // chosen output is missing, playing to the system output
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

// Switch camera: resolves after the track has actually been replaced, rejects on failure
cameraSelect.onchange = async () => {
  try {
    await media.cameraController.switchDevice(cameraSelect.value);
  } catch (e) {
    cameraSelect.value = media.cameraController.getConfiguration().deviceId ?? ''; // config is rolled back
  }
};

// Switch microphone (same contract)
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

// Or let Valm do it: open the system device when the chosen one is missing,
// and return to it when it is plugged back in
const media = new Valm({
  audio: { deviceFallback: 'default' },
  video: { deviceFallback: 'default' },
});
media.microphoneController.onDeviceFallback(({ requestedDeviceId, actualDeviceId, reason }) => {
  showNotification('Selected microphone is unavailable, using the default one');
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
| `onDefaultDeviceChanged(cb)` | `VoidFunction` | The OS switched the system microphone/speaker |
| `state` | `DevicesState` | Current state |

## API — AudioOutputController

| Method | Returns | Description |
|--------|---------|-------------|
| `setOutputDevice(deviceId)` | `Promise<boolean>` | Select a speaker (`null`/`'default'` — system); `false` if not applied |
| `registerAudioElement(el)` | `VoidFunction` | Register an element |
| `playTestSound(opts?)` | `Promise<void>` | Play a test sound |
| `autoSelectSpeakerphone()` | `Promise<boolean>` | Auto-select speaker (mobile) |
| `isOutputSelectionSupported()` | `boolean` | setSinkId support |
| `getOutputState()` | `AudioOutputState` | Output state |
| `onChange(cb)` | `VoidFunction` | Subscribe to changes |
| `onError(cb)` | `VoidFunction` | Output selection errors |
| `onDeviceLost(cb)` | `VoidFunction` | Selected output disappeared |
