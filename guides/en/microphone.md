# MicrophoneController

Managing the microphone: enabling/disabling, soft mute, switching devices, audio processing, voice detection, previewing.

## Access

```typescript
const mic = media.microphoneController;
```

---

## Actions

### Enable / disable

```typescript
await mic.enable()             // enable the microphone
await mic.enable(deviceId)     // enable with a specific device
mic.disable()                  // disable (fully stops the track)
await mic.toggle()             // toggle state (enable ↔ disable)
await mic.reset()              // disable the microphone (if it was on)
mic.destroy()                  // destroy the controller, remove all subscriptions
```

### Mute / Unmute

Unlike `disable()`, soft mute keeps the track active but silences the audio:

```typescript
await mic.toggleMute()   // mute ↔ unmute (the track stays, but track.enabled = false)
```

### Switching devices

```typescript
const result = await mic.switchDevice(deviceId)  // resolves after the track has actually been replaced
// result: { applied: boolean, deviceId, reason?: 'noop' | 'superseded' | 'disabled' }
await mic.switchDevice(null)                     // system default microphone
await mic.reacquire()                            // reopen the current device (e.g. 'default' after the OS switched input)
await mic.updateDevice(deviceId)                 // only updates the configuration, errors go to onError
```

`switchDevice` rejects if the new device could not be opened; in that case the previous track keeps working and `deviceId` in the configuration is rolled back. Soft mute survives the switch. When the microphone is off, only the configuration is updated (`reason: 'disabled'`). A call superseded by a newer `switchDevice` resolves with `reason: 'superseded'`.

### Audio processing

```typescript
// updateAudioProcessing(options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean })
await mic.updateAudioProcessing({ echoCancellation: true })
await mic.updateAudioProcessing({ noiseSuppression: false, autoGainControl: true })
await mic.updateAudioProcessing({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })

// updateVolumeThreshold(threshold: number)
mic.updateVolumeThreshold(15)   // speech-detection threshold, 0–100
mic.updateVolumeThreshold(30)
```

### Preview

A separate track for previewing — it doesn't affect the main stream.

```typescript
const track = await mic.preview()           // create a preview track
const track = await mic.preview(deviceId)   // preview with a specific device

await mic.publishPreview()   // publish the preview as the main track
mic.stopPreview()            // stop the preview without publishing
```

---

## Getters and state

```typescript
mic.state               // MicrophoneState — current state
mic.getStream()         // MediaStream | null
mic.getTrack()          // MediaStreamTrack | null
mic.getConfiguration()  // AudioConfiguration
```

### `MicrophoneState`

```typescript
interface MicrophoneState {
  isEnabled: boolean                   // microphone on and track active
  isMuted: boolean                     // track muted (mute)
  isPreviewing: boolean                // preview track active
  hasDevice: boolean                   // an audio device was detected
  deviceId: string | null              // ID of the current device
  settings: MediaTrackSettings | null  // settings of the active track
  volume: number                       // current volume level (0–100)
  isSpeaking: boolean                  // whether the user is speaking
  isSourceMuted: boolean               // the source delivers no audio (track.muted: BT profile switch,
                                       // system mute) — unlike isMuted, not controlled by Valm
}
```

### `AudioConfiguration`

```typescript
interface AudioConfiguration {
  enabled: boolean
  deviceId: string | null
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  enableSpeakingDetection: boolean
  volumeThreshold: number              // speech-detection threshold (0–100)
  constraints: MediaTrackConstraints
  deviceFallback?: 'none' | 'default'  // chosen mic is missing: 'none' — error (default), 'default' — open the system one
  followSystemDefault?: boolean        // in "Default" mode, reopen the track when the OS switches the system input
  sourceMuteDebounceMs?: number        // delay before onSourceMuteChange({ muted: true }); short blips are not reported (default 0)
}
```

With `deviceFallback: 'default'` the chosen `deviceId` stays in the configuration: Valm switches back to it once it is plugged in again. If the active microphone disappears while in use, Valm reopens the system one (`onDeviceFallback` with `reason: 'device-lost'`).

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
const unsub = mic.onStateChange((state: MicrophoneState) => { ... })

mic.onVolumeChange(({ volume, isSpeaking }: VolumeChangeEvent) => {
  // volume: number      — current level (0–100)
  // isSpeaking: boolean — whether the user is speaking
})

mic.onError((error: MediaErrorEvent) => {
  // error.source: 'microphone' | 'camera/microphone'
  // error.action: 'enable' | 'disable' | 'switch' | 'preview' | 'configUpdate' | ...
  // error.error: unknown
})

mic.onTrackReplaced(({ oldTrack, newTrack, isMuted }) => {
  // oldTrack: MediaStreamTrack
  // newTrack: MediaStreamTrack
  // isMuted: boolean — soft mute is already applied to newTrack
})

// The source stopped/started delivering audio (works with the audio graph enabled too)
mic.onSourceMuteChange(({ muted, track }) => showWarning(muted ? 'Microphone is silent' : null))

// The track ended not by disable(): reason 'device-lost' | 'ended'
mic.onTrackEnded(({ reason, deviceId, label }) => { ... })

// Chosen microphone is missing, the system one was opened (deviceFallback: 'default')
mic.onDeviceFallback(({ requestedDeviceId, actualDeviceId, reason }) => { ... })

unsub() // unsubscribe
```

---

## Audio processing

Software gain (on top of the browser's AGC) and visualization data. They work through
a lightweight Web Audio graph. On first use the graph turns on: the published
audio track is replaced with the processed one — subscribers of `onTrackReplaced` receive the
new track. ML noise suppression is attached separately, see
[audio-effects.md](./audio-effects.md).

```typescript
// Volume: a multiplier, 1.0 = unchanged
mic.setGain(1.5)
mic.getGain()          // 1.5

// Visualization data for the current frame
mic.getFrequencyData()  // Uint8Array — spectrum (empty array until the graph is active)
mic.getWaveformData()   // Uint8Array — waveform of the signal

// A per-frame data stream (for drawing an equalizer / oscilloscope)
const unsub = mic.onAudioData(({ frequency, waveform }) => {
  drawSpectrum(frequency)   // frequency.length === 1024
  drawWaveform(waveform)    // waveform.length === 2048
})
```

> `getFrequencyData()` / `getWaveformData()` are synchronous and return an empty array
> until the graph is active. It turns on after `setGain()`, `onAudioData()` or
> attaching `AudioEffectsPlugin`.

---

## Common scenarios

### Video call with a volume indicator

```typescript
await mic.enable();

mic.onVolumeChange(({ volume, isSpeaking }) => {
  volumeMeter.value = volume;
  avatar.classList.toggle('speaking', isSpeaking);
});

// Mute on button click
muteBtn.onclick = () => mic.toggleMute();
```

### Checking the microphone before a call

```typescript
const track = await mic.preview();
previewAudio.srcObject = new MediaStream([track]);

mic.onVolumeChange(({ volume }) => {
  previewMeter.value = volume;
});

// User confirmed
await mic.publishPreview();
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `enable(deviceId?)` | `Promise<void>` | Enable the microphone |
| `disable()` | `void` | Disable (stops the track) |
| `toggle()` | `Promise<void>` | Toggle on/off |
| `toggleMute()` | `Promise<void>` | Soft mute/unmute |
| `reset()` | `Promise<void>` | Disable (if it was on) |
| `destroy()` | `void` | Destroy the controller |
| `switchDevice(deviceId, opts?)` | `Promise<SwitchResult>` | Switch the device and wait for the new track; `opts.force` reopens the same device |
| `reacquire()` | `Promise<SwitchResult>` | Reopen the current device |
| `updateDevice(deviceId)` | `Promise<void>` | Update the device in the configuration |
| `updateAudioProcessing(opts)` | `Promise<void>` | Configure audio processing |
| `updateVolumeThreshold(n)` | `void` | Speech-detection threshold (0–100) |
| `setGain(value)` | `void` | Software volume multiplier (1.0 = unchanged) |
| `getGain()` | `number` | Current volume multiplier |
| `getFrequencyData()` | `Uint8Array` | Spectrum of the current frame |
| `getWaveformData()` | `Uint8Array` | Waveform of the signal |
| `onAudioData(cb)` | `VoidFunction` | Per-frame `{ frequency, waveform }` stream |
| `preview(deviceId?)` | `Promise<MediaStreamTrack>` | Create a preview track |
| `publishPreview()` | `Promise<void>` | Publish the preview to the main stream |
| `stopPreview()` | `void` | Stop the preview |
| `state` | `MicrophoneState` | Current state |
| `getStream()` | `MediaStream \| null` | Media stream |
| `getTrack()` | `MediaStreamTrack \| null` | Audio track |
| `getConfiguration()` | `AudioConfiguration` | Current configuration |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to `MicrophoneState` |
| `onVolumeChange(cb)` | `VoidFunction` | Subscribe to the volume level |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
| `onTrackReplaced(cb)` | `VoidFunction` | Subscribe to track replacement |
| `onSourceMuteChange(cb)` | `VoidFunction` | Source muted/unmuted (`track.muted`) |
| `onTrackEnded(cb)` | `VoidFunction` | Track ended not by `disable()` |
| `onDeviceFallback(cb)` | `VoidFunction` | System device opened instead of the chosen one |
