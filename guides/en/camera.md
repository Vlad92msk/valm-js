# CameraController

Managing the video camera: enabling/disabling, switching devices, previewing, obtaining the track.

## Access

```typescript
const camera = media.cameraController;
```

---

## Actions

### Enable / disable

```typescript
await camera.enable()             // enable the camera
await camera.enable(deviceId)     // enable with a specific device
camera.disable()                  // disable
await camera.toggle()             // toggle state
await camera.reset()              // disable (reset alias)
camera.destroy()                  // destroy the controller, remove all subscriptions
```

### Switching devices

```typescript
await camera.switchDevice(deviceId)   // switch the track immediately (if the camera is on)
await camera.updateDevice(deviceId)   // update deviceId in the configuration without switching the track
await camera.toggleFacing()           // switch between 'user' (front) and 'environment' (rear)
```

### Preview

A separate track for previewing — it doesn't affect the main stream.

```typescript
const track = await camera.preview()           // create a preview track
const track = await camera.preview(deviceId)   // preview with a specific device
previewVideo.srcObject = new MediaStream([track])

await camera.publishPreview()   // publish the preview as the main track
camera.stopPreview()            // stop the preview without publishing
```

### Updating configuration

```typescript
// updateResolution(width: number, height: number)
camera.updateResolution(1280, 720)
camera.updateResolution(1920, 1080)

// updateFrameRate(frameRate: number)
camera.updateFrameRate(30)
camera.updateFrameRate(60)

// updateConstraints(constraints: MediaTrackConstraints)
// Merged with the current constraints — pass only what you want to change
camera.updateConstraints({ aspectRatio: 16 / 9 })
camera.updateConstraints({ facingMode: 'environment' })
camera.updateConstraints({ width: { min: 640, ideal: 1280 }, frameRate: { max: 30 } })
```

---

## Frame capture

A static frame from the camera. If the effects pipeline is active, the frame is taken
**after** processing (with blur / virtual background applied), otherwise from the raw track.
The primary path is `ImageCapture.grabFrame()`, with a `<video>`-render fallback.

```typescript
// captureFrame(options?): Promise<Blob>
const blob = await camera.captureFrame()
const jpeg = await camera.captureFrame({ format: 'image/jpeg', quality: 0.85 })
const thumb = await camera.captureFrame({ width: 320 })   // downscale preserving aspect ratio

// captureFrameDataURL(options?): Promise<string>
const dataUrl = await camera.captureFrameDataURL()
avatarImg.src = dataUrl

// captureFrameToCanvas(canvas?): HTMLCanvasElement — synchronous, native track size
const canvas = camera.captureFrameToCanvas()
```

```typescript
interface CaptureFrameOptions {
  format?: 'image/png' | 'image/jpeg' | 'image/webp'  // defaults to 'image/png'
  quality?: number   // 0–1, for jpeg/webp
  width?: number     // downscale, defaults to the native track size
  height?: number
}
```

> `captureFrameToCanvas()` is synchronous and requires a frame that's already ready in the
> internal `<video>`. The first call (or a call right after a track switch) warms it up and
> throws a "frame not ready yet" error — call again and it works. For a one-off
> snapshot use the async `captureFrame()`.

---

## Advanced controls (mobile)

Zoom / torch / focus / exposure — applied to the physical camera track.
Each method is a no-op with a clear error (via `onError`, `source: 'camera'`)
if the capability is not supported by the device.

```typescript
// Full track capabilities
camera.getCapabilities()   // MediaTrackCapabilities | null (null if the camera is off)

// Zoom — the value is clamped to the capabilities range
await camera.setZoom(2)

// Torch
await camera.toggleTorch()       // toggle
await camera.toggleTorch(true)   // force on

// Focus and exposure
await camera.setFocusMode('continuous')     // 'continuous' | 'manual' | 'single-shot'
await camera.setExposureMode('continuous')  // 'continuous' | 'manual'

// Aggregated state — handy for rendering UI
const adv = camera.getAdvancedState()
if (adv.zoom.supported) {
  slider.min = adv.zoom.min; slider.max = adv.zoom.max; slider.step = adv.zoom.step
}
```

```typescript
interface AdvancedCameraState {
  zoom: { supported: boolean; min?: number; max?: number; step?: number; value?: number }
  torch: { supported: boolean; on: boolean }
  focus: { supported: boolean; mode?: string }
  exposure: { supported: boolean; mode?: string }
}
```

---

## Getters and state

```typescript
camera.state                  // CameraState — current state
camera.getStream()            // MediaStream | null
camera.getTrack()             // MediaStreamTrack | null
camera.getConfiguration()     // VideoConfiguration
```

### `CameraState`

```typescript
interface CameraState {
  isEnabled: boolean                   // camera on and track active
  isMuted: boolean                     // track muted
  isPreviewing: boolean                // preview track active
  hasDevice: boolean                   // a video device was detected
  deviceId: string | null              // ID of the current device
  settings: MediaTrackSettings | null  // settings of the active track
}
```

### `VideoConfiguration`

```typescript
interface VideoConfiguration {
  enabled: boolean
  deviceId: string | null
  resolution: { width: number; height: number }
  frameRate: number
  facingMode: 'user' | 'environment'
  constraints: MediaTrackConstraints
}
```

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
const unsub = camera.onStateChange((state: CameraState) => { ... })

camera.onError((error: MediaErrorEvent) => {
  // error.source: 'camera' | 'camera/microphone'
  // error.action: 'enable' | 'disable' | 'switch' | 'preview' | ...
  // error.error: unknown
})

camera.onTrackReplaced(({ oldTrack, newTrack, source }) => {
  // source: 'device' | 'background' | undefined
})

unsub() // unsubscribe
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `enable(deviceId?)` | `Promise<void>` | Enable the camera |
| `disable()` | `void` | Disable the camera |
| `toggle()` | `Promise<void>` | Toggle state |
| `reset()` | `Promise<void>` | Disable the camera |
| `destroy()` | `void` | Destroy the controller |
| `switchDevice(deviceId)` | `Promise<void>` | Switch device and track |
| `updateDevice(deviceId)` | `Promise<void>` | Update deviceId in the configuration |
| `toggleFacing()` | `Promise<void>` | Front / rear camera |
| `preview(deviceId?)` | `Promise<MediaStreamTrack>` | Create a preview track |
| `publishPreview()` | `Promise<void>` | Publish the preview to the main stream |
| `stopPreview()` | `void` | Stop the preview |
| `updateResolution(w, h)` | `void` | Change the resolution |
| `updateFrameRate(fps)` | `void` | Change the frame rate |
| `updateConstraints(c)` | `void` | Set additional constraints |
| `captureFrame(options?)` | `Promise<Blob>` | Frame capture as a Blob |
| `captureFrameDataURL(options?)` | `Promise<string>` | Frame capture as a data-URL |
| `captureFrameToCanvas(canvas?)` | `HTMLCanvasElement` | Synchronous capture into a canvas |
| `getCapabilities()` | `MediaTrackCapabilities \| null` | Track capabilities |
| `setZoom(value)` | `Promise<void>` | Zoom (clamped to range) |
| `toggleTorch(on?)` | `Promise<void>` | Torch |
| `setFocusMode(mode)` | `Promise<void>` | Focus mode |
| `setExposureMode(mode)` | `Promise<void>` | Exposure mode |
| `getAdvancedState()` | `AdvancedCameraState` | Zoom/torch/focus/exposure |
| `state` | `CameraState` | Current state |
| `getStream()` | `MediaStream \| null` | Media stream |
| `getTrack()` | `MediaStreamTrack \| null` | Video track |
| `getConfiguration()` | `VideoConfiguration` | Current configuration |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to `CameraState` |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
| `onTrackReplaced(cb)` | `VoidFunction` | Subscribe to track replacement |
