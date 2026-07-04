# Utilities

Helper tools for platform detection and voice activity detection.

---

## DeviceDetector

Detecting the user's platform and browser.

### Access

```typescript
import { DeviceDetector } from 'valm-js'
```

`DeviceDetector` is a utility object — no instantiation required.

### Platform detection

```typescript
// isMobile(): boolean
DeviceDetector.isMobile()   // true on smartphones and tablets

// isIOS(): boolean
DeviceDetector.isIOS()      // true on iPhone/iPad

// isAndroid(): boolean
DeviceDetector.isAndroid()  // true on Android devices

// isDesktop(): boolean
DeviceDetector.isDesktop()  // true if not a mobile device
```

### Browser and capability detection

```typescript
// isSafari(): boolean
DeviceDetector.isSafari()       // true in Safari (desktop and iOS)

// isIOSSafari(): boolean
DeviceDetector.isIOSSafari()    // true only in Safari on iOS

// isIOSChrome(): boolean
DeviceDetector.isIOSChrome()    // true in Chrome on iOS (CriOS)

// isTouchDevice(): boolean
DeviceDetector.isTouchDevice()  // true if a touchscreen is present
```

### Example

```typescript
import { DeviceDetector } from 'valm-js'

if (DeviceDetector.isIOSSafari()) {
  // On iOS Safari, a user gesture is required before the first getUserMedia.
  // Show a button and call requestIOSMediaPermissions() on click.
} else {
  await media.initializeMedia()
}
```

### iOS Media Helpers

Helper functions for working with media on iOS — they delegate to `DeviceDetector`.

```typescript
import { isIOS, isIOSSafari, isIOSChrome, requestIOSMediaPermissions } from 'valm-js'

// Request camera and microphone permissions on iOS.
// Call inside a user-gesture handler (click, tap) — before initializeMedia().
const result = await requestIOSMediaPermissions()
// result = {
//   video: true,  // camera permission granted
//   audio: true,  // microphone permission granted
// }
```

### API table

| Method | Returns | Description |
|---|---|---|
| `isMobile()` | `boolean` | Mobile device (by UA, touchscreen and screen size) |
| `isIOS()` | `boolean` | iPhone / iPad |
| `isAndroid()` | `boolean` | Android device |
| `isDesktop()` | `boolean` | Not a mobile device |
| `isTouchDevice()` | `boolean` | Has a touchscreen |
| `isSafari()` | `boolean` | Safari browser |
| `isIOSSafari()` | `boolean` | Safari on iOS |
| `isIOSChrome()` | `boolean` | Chrome on iOS (CriOS) |

---

## VoiceActivityDetector

Detects voice activity in an audio stream via the Web Audio API. Used inside `MicrophoneController`, but can be applied on its own with any `MediaStreamTrack`.

### Access

```typescript
import { VoiceActivityDetector } from 'valm-js'

const vad = new VoiceActivityDetector({
  volumeThreshold: 20,  // volume level above which speech is assumed (0-100)
  silenceTimeout: 800,  // ms of silence after which isSpeaking becomes false
})
```

### Configuration

```typescript
interface VoiceActivityConfig {
  volumeThreshold: number   // Volume threshold for detecting speech (0-100)
  silenceTimeout: number    // After how many ms of silence we consider speech stopped

  fftSize?: number          // FFT block size: 256 (default) or 512 — larger = more accurate but slower
  updateInterval?: number   // Analysis update interval in ms (default 100)
  smoothingFactor?: number  // Volume-level smoothing 0-1 (default 0.2; closer to 1 — smoother, reacts more slowly)
}
```

### Control

```typescript
// start(track: MediaStreamTrack): void
// Start analysis. Does nothing if the track is disabled (track.enabled = false).
vad.start(audioTrack)

// stop(): void
// Stop analysis and release the AudioContext.
vad.stop()

// updateConfig(newConfig: Partial<VoiceActivityConfig>): void
// Update parameters on the fly without a restart.
vad.updateConfig({ volumeThreshold: 30 })
```

### Subscriptions

```typescript
// onStateChange(callback): VoidFunction
const unsubscribe = vad.onStateChange((state) => {
  // state = {
  //   volume: 42,        // current volume level (0-100, smoothed)
  //   isSpeaking: true,  // true if volume > volumeThreshold
  // }
  console.log(`Volume: ${state.volume}, Speaking: ${state.isSpeaking}`)
})

// Unsubscribe
unsubscribe()
```

The callback is invoked only on a real state change: either `isSpeaking` changed or the volume level changed by more than 1 unit.

### Full example

```typescript
import { VoiceActivityDetector } from 'valm-js'

const vad = new VoiceActivityDetector({
  volumeThreshold: 15,
  silenceTimeout: 1000,
  smoothingFactor: 0.3,
})

const unsubscribe = vad.onStateChange((state) => {
  // state = {
  //   volume: 28,       // smoothed volume level (0-100)
  //   isSpeaking: true, // whether the user is speaking right now
  // }
  updateVolumeIndicator(state.volume)

  if (state.isSpeaking) {
    showSpeakingIndicator()
  } else {
    hideSpeakingIndicator()
  }
})

// Pass an audio track
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
vad.start(stream.getAudioTracks()[0])

// On cleanup
unsubscribe()
vad.stop()
```

### API table

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `start(track)` | `MediaStreamTrack` | `void` | Start analyzing an audio track |
| `stop()` | — | `void` | Stop analysis, release the AudioContext |
| `updateConfig(config)` | `Partial<VoiceActivityConfig>` | `void` | Update parameters without a restart |
| `onStateChange(callback)` | `(state: VoiceActivityState) => void` | `VoidFunction` | Subscribe to state changes |
