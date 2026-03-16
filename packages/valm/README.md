# valm

TypeScript library for managing media streams in the browser. Camera, microphone, screen share, recording, speech transcription, and video effects — all in one clean API.

## Install

```bash
npm install valm-js
# or
yarn add valm-js
```

For video effects (blur, virtual background), `@mediapipe/tasks-vision` is a peer dependency:

```bash
npm install @mediapipe/tasks-vision
```

## Quick start

```typescript
import { Valm } from 'valm-js'

const media = new Valm({
  video: { enabled: true },
  audio: { enabled: true },
})

await media.initialize()

const stream = media.cameraController.getStream()
videoElement.srcObject = stream
```

## Controllers

After calling `media.initialize()`, all controllers are available:

| Controller | Access | Description |
|---|---|---|
| Camera | `media.cameraController` | Enable/disable, device switching, preview |
| Microphone | `media.microphoneController` | Enable/mute/disable, voice detection |
| Screen share | `media.screenShareController` | Start/stop, surface selection |
| Recording | `media.recordingController` | Start/stop/pause, format, limits, streaming |
| Transcription | `media.transcriptionController` | Speech-to-text via Web Speech API |
| Devices | `media.devicesController` | List cameras/microphones, watch for changes |
| Configuration | `media.configurationController` | Read/update/export/import config |
| Effects | `media.effectsController` | Video effects (requires `EffectsPlugin`) |
| Permissions | `media.permissions` | Check camera/microphone permissions |

## Camera

```typescript
const camera = media.cameraController

await camera.enable()
await camera.enable(deviceId)   // specific device
camera.disable()
await camera.toggle()

await camera.switchDevice(deviceId)
await camera.toggleFacing()     // front ↔ back

// Preview without affecting the main stream
const track = await camera.preview(deviceId)
previewVideo.srcObject = new MediaStream([track])
await camera.publishPreview()   // make preview the main track

camera.updateResolution(1920, 1080)
camera.updateFrameRate(60)

const stream = camera.getStream()   // MediaStream | null
const state  = camera.state         // CameraState

camera.onStateChange((state) => { /* state.isEnabled, state.deviceId, ... */ })
camera.onTrackReplaced(({ oldTrack, newTrack }) => { })
```

## Microphone

```typescript
const mic = media.microphoneController

await mic.enable()
mic.disable()
mic.mute()    // soft mute — keeps the track alive
mic.unmute()

await mic.switchDevice(deviceId)

mic.onStateChange((state) => {
  // state.isEnabled, state.isMuted, state.isSpeaking, state.volume
})
mic.onVolumeChange((volume) => { /* 0–1 */ })
```

## Screen share

```typescript
const screenShare = media.screenShareController

await screenShare.start()
screenShare.stop()
await screenShare.toggle()

screenShare.updateDisplaySurface('window')  // 'monitor' | 'window' | 'application'

const stream = screenShare.getStream()
```

## Recording

```typescript
const recording = media.recordingController

await recording.startRecording({
  includeVideo: true,
  includeAudio: true,
  quality: 'high',             // 'low' | 'medium' | 'high' | 'custom'
  format: 'webm',              // 'webm' | 'mp4' | 'mkv'
  maxDuration: 3600,           // seconds, 0 = unlimited
  maxFileSize: 500,            // MB, 0 = unlimited
  chunkInterval: 1000,         // ms between onRecordingData callbacks
})

recording.pauseRecording()
recording.resumeRecording()

const blob = await recording.stopRecording()

recording.onRecordingStopped((blob, utils) => {
  utils.downloadBlob(blob, 'recording.webm')
  // utils.createObjectURL(blob)
  // utils.uploadBlob(blob, '/api/upload')
  // utils.saveToIndexedDB(blob, 'session-1')
})

recording.onRecordingData(({ chunk, totalSize, duration }) => {
  // streaming to server, progress bar, etc.
})

recording.onRecordingLimitReached(({ type, limit }) => {
  // type: 'duration' | 'fileSize'
})
```

## Transcription

Uses the browser's Web Speech API (Chrome and Edge only).

```typescript
const transcription = media.transcriptionController

await transcription.start()
transcription.stop()

transcription.onTranscript(({ text, isFinal }) => {
  subtitleEl.textContent = text
})
```

## Video effects

Video effects require the `EffectsPlugin` and the `@mediapipe/tasks-vision` peer dependency.

```typescript
import { Valm, EffectsPlugin } from 'valm-js'

const media = new Valm({ video: { enabled: true } })
media.use(new EffectsPlugin())
await media.initialize()

const effects = media.effectsController

// Background blur
await effects.enableBlur({ intensity: 0.7 })
effects.setBlurIntensity(0.5)
effects.disableBlur()
await effects.toggleBlur()

// Virtual background
await effects.setVirtualBackground('/backgrounds/office.jpg')
effects.setVirtualBackgroundColor('#00AA00')
effects.setVirtualBackgroundFitMode(BackgroundFitMode.COVER)
effects.removeVirtualBackground()

// Quality presets
effects.setQualityPreset('high')  // 'low' | 'medium' | 'high' | 'ultra' | 'custom'

effects.onStateChange((state) => {
  // state.blur.isEnabled, state.currentFps, state.activeEffects
})
```

## Custom effects

Implement `IVideoEffect` (or extend `BaseEffect`) and add it to the pipeline:

```typescript
import { BaseEffect, EffectType, EffectFeature, FrameContext } from 'valm-js'

class SepiaEffect extends BaseEffect<{ intensity: number }> {
  readonly name = 'sepia'
  readonly type = EffectType.COLOR_FILTER
  readonly requiredFeatures: EffectFeature[] = []

  constructor() {
    super({ intensity: 1.0 })
  }

  apply(ctx: FrameContext): void {
    const { sourceCtx, outputCtx, width, height } = ctx
    const imageData = sourceCtx.getImageData(0, 0, width, height)
    // ... pixel manipulation ...
    outputCtx.putImageData(imageData, 0, 0)
  }
}

await effects.addEffect(new SepiaEffect())
```

For effects that need ML data, declare `requiredFeatures` — the pipeline loads the relevant providers automatically:

```typescript
class MySegmentationEffect extends BaseEffect<MyParams> {
  readonly requiredFeatures = [EffectFeature.SEGMENTATION]

  apply(ctx: FrameContext): void {
    const { segmentationMask } = ctx  // Uint8Array: 0 = person, 255 = background
    // ...
  }
}
```

`EffectFeature.FACE_MESH` gives you `ctx.faceMesh.landmarks` — 478 normalized face points.

## Plugin system

Extend `Valm` without touching the core:

```typescript
import { IMediaPlugin, PluginContext, MediaEvents } from 'valm-js'

class AnalyticsPlugin implements IMediaPlugin {
  readonly name = 'analytics'
  private unsubs: VoidFunction[] = []

  install(context: PluginContext): void {
    this.unsubs.push(
      context.mediaStreamService.on(MediaEvents.TRACK_ADDED, ({ kind }) => {
        this.track('track_added', { kind })
      }),
    )
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn())
  }

  private track(name: string, data: object): void { /* ... */ }
}

media.use(new AnalyticsPlugin())
```

## Events

```typescript
media.on('error', ({ source, error, action }) => { })
media.on('videoDisabled', () => { })
media.on('audioDisabled', () => { })
media.on('videoStateChanged', (state) => { /* MediaStreamState */ })
media.on('audioStateChanged', (state) => { })
media.on('mediaReset', () => { })
```

All `on*` subscriptions (both `media.on()` and `controller.onXxx()`) return an unsubscribe function:

```typescript
const unsub = camera.onStateChange((state) => { })
unsub() // stop listening
```

## Configuration

All fields are optional — unset fields use defaults.

```typescript
const media = new Valm({
  video: {
    enabled: true,
    deviceId: null,
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
  },
  audio: {
    enabled: true,
    echoCancellation: true,
    noiseSuppression: true,
    enableSpeakingDetection: false,
  },
  recording: {
    format: 'webm',
    quality: 'medium',
  },
  transcription: {
    language: 'en-US',
    interimResults: true,
  },
  debug: false,
  autoInitialize: false,
})
```

Update config at runtime:

```typescript
media.configurationController.setVideoResolution(1920, 1080)
media.configurationController.setAudioDevice(deviceId)
media.configurationController.updateRecordingConfig({ quality: 'high' })

// Export / import
const json = media.configurationController.exportConfig()
media.configurationController.importConfig(json)
```

## Permissions

```typescript
const state = await media.permissions.checkPermission('camera')
// 'granted' | 'denied' | 'prompt' | 'unknown'

const { camera, microphone } = await media.permissions.checkAll()
await media.permissions.request('camera')
```

## License

MIT
