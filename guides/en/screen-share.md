# ScreenShareController

Managing screen sharing: start/stop, surface configuration, resolution, FPS, audio.

## Access

```typescript
const screenShare = media.screenShareController;
```

---

## Actions

### Start / stop

```typescript
await screenShare.start()    // start sharing (opens the system picker dialog)
screenShare.stop()           // stop
await screenShare.toggle()   // toggle: if active — stop, otherwise — start
```

### Broadcast mode (mode)

The mode automatically picks optimal `maxFrameRate` and `contentHint`:

```typescript
// updateMode(mode: 'presentation' | 'video')
screenShare.updateMode('presentation')  // slides, documents — 5 FPS, contentHint='text' (light on CPU)
screenShare.updateMode('video')         // movies, games — 30 FPS, contentHint='motion' (smooth)
```

The default mode is `'presentation'`.

> If you set `maxFrameRate` or `contentHint` manually — they override the values from the mode.

### Configuration before start

```typescript
// updateDisplaySurface(surface: 'monitor' | 'window' | 'application')
screenShare.updateDisplaySurface('monitor')      // capture the whole monitor
screenShare.updateDisplaySurface('window')       // capture a specific window
screenShare.updateDisplaySurface('application')  // capture an application

// updateAudioIncluded(includeAudio: boolean)
screenShare.updateAudioIncluded(true)   // capture system audio
screenShare.updateAudioIncluded(false)  // video only

// updateMaxResolution(maxWidth?: number, maxHeight?: number)
screenShare.updateMaxResolution(1920, 1080)  // limit the resolution
screenShare.updateMaxResolution()            // remove the limit

// updateMaxFrameRate(maxFrameRate?: number)
screenShare.updateMaxFrameRate(30)   // limit to 30 FPS
screenShare.updateMaxFrameRate(60)   // limit to 60 FPS
screenShare.updateMaxFrameRate()     // remove the limit (the value from mode will be used)

// updateContentHint(contentHint: 'motion' | 'detail' | 'text' | '')
screenShare.updateContentHint('detail')  // presentations, documents — optimize for sharpness
screenShare.updateContentHint('motion')  // video, games — optimize for smoothness
screenShare.updateContentHint('text')    // text documents — maximum text sharpness
screenShare.updateContentHint('')        // no hint

// updateConstraints(constraints: Partial<ScreenShareConfiguration>)
// Update several parameters at once
screenShare.updateConstraints({
  preferDisplaySurface: 'monitor',
  includeAudio: true,
  maxWidth: 1920,
  maxHeight: 1080,
  mode: 'video',
})
```

> Changing parameters during active sharing automatically restarts the share with the new settings.

### Support check (static method)

```typescript
const result = await ScreenShareController.checkCapabilities()
// {
//   supported: boolean                           // whether the browser supports getDisplayMedia
//   capabilities?: MediaTrackSupportedConstraints // supported video constraints (if supported: true)
// }

if (!result.supported) {
  console.warn('Screen sharing not supported')
}
```

---

## Getters and state

```typescript
screenShare.state              // ScreenShareState — current state
screenShare.getStream()        // MediaStream | null — active media stream
screenShare.getTrack()         // MediaStreamTrack | null — the stream's video track
screenShare.getActiveSettings() // MediaTrackSettings | null — settings of the active track
screenShare.getConfiguration() // ScreenShareConfiguration — current configuration
```

### `ScreenShareState`

```typescript
interface ScreenShareState {
  isActive: boolean          // sharing is active
  stream: MediaStream | null // active media stream (null if not active)
}
```

### `ScreenShareConfiguration`

```typescript
type ScreenShareMode = 'presentation' | 'video'

interface ScreenShareConfiguration {
  preferDisplaySurface: 'monitor' | 'window' | 'application' // type of the captured surface
  includeAudio: boolean       // capture system audio
  mode?: ScreenShareMode      // broadcast mode — determines frameRate and contentHint
  maxWidth?: number           // maximum width (undefined = no limit)
  maxHeight?: number          // maximum height (undefined = no limit)
  maxFrameRate?: number       // maximum frame rate (if unset — from mode)
  contentHint?: 'motion' | 'detail' | 'text' | '' // codec hint (if unset — from mode)
}
```

#### Mode presets

| Mode | `maxFrameRate` | `contentHint` | Use |
|------|---------------|---------------|-----|
| `presentation` (default) | 5 | `text` | Slides, documents, code — the screen changes rarely |
| `video` | 30 | `motion` | Movies, games, video content — smooth motion |

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
const unsub = screenShare.onStateChange((state: ScreenShareState) => {
  // state.isActive: boolean — sharing is active
  // state.stream: MediaStream | null — the current stream
  console.log('Active:', state.isActive)
  if (state.stream) {
    videoEl.srcObject = state.stream
  }
})

screenShare.onError((error: MediaErrorEvent) => {
  // error.source: 'screenShare'
  // error.action: 'start' | 'stop' | 'configUpdate' | undefined
  // error.error: unknown — the original error
  console.error(`Screen share error [${error.action}]:`, error.error)
})

unsub() // unsubscribe
```

---

## Common scenarios

### Presenting slides

```typescript
screenShare.updateMode('presentation')  // 5 FPS, contentHint='text' — minimal CPU load
screenShare.updateDisplaySurface('window')
screenShare.updateMaxResolution(1920, 1080)
await screenShare.start()

videoEl.srcObject = screenShare.getStream()
```

### Capturing a game / video

```typescript
screenShare.updateMode('video')  // 30 FPS, contentHint='motion' — smooth picture
screenShare.updateAudioIncluded(true)
await screenShare.start()
```

### On/off button

```typescript
shareBtn.onclick = async () => {
  await screenShare.toggle()
  shareBtn.textContent = screenShare.state.isActive ? 'Stop' : 'Share screen'
}
```

### Reacting to a system stop (the user pressed "Stop" in the browser)

```typescript
screenShare.onStateChange((state) => {
  if (!state.isActive) {
    // the user may have stopped sharing via the browser's built-in UI
    shareBtn.textContent = 'Share screen'
  }
})
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `start()` | `Promise<void>` | Start screen sharing |
| `stop()` | `void` | Stop sharing |
| `toggle()` | `Promise<void>` | Toggle start/stop |
| `updateMode(mode)` | `void` | Broadcast mode (`'presentation'` / `'video'`) |
| `updateDisplaySurface(s)` | `void` | Type of the captured surface |
| `updateAudioIncluded(b)` | `void` | Capture system audio |
| `updateMaxResolution(w?, h?)` | `void` | Limit the resolution |
| `updateMaxFrameRate(fps?)` | `void` | Limit FPS (overrides the value from mode) |
| `updateContentHint(hint)` | `void` | Codec hint (overrides the value from mode) |
| `updateConstraints(opts)` | `void` | Update several parameters |
| `getConfiguration()` | `ScreenShareConfiguration` | Current configuration |
| `state` | `ScreenShareState` | Current state (getter) |
| `getStream()` | `MediaStream \| null` | Active media stream |
| `getTrack()` | `MediaStreamTrack \| null` | The stream's video track |
| `getActiveSettings()` | `MediaTrackSettings \| null` | Settings of the active track |
| `checkCapabilities()` | `Promise<{ supported: boolean, capabilities?: MediaTrackSupportedConstraints }>` | Static — check browser support |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to `ScreenShareState` changes |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
