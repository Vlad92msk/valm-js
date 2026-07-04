# ConfigurationController

Centralized configuration management: reading by section, updating, resetting to defaults, import/export.

## Access

```typescript
const config = media.configurationController;
```

---

## Actions

### Reading configuration

```typescript
// getConfig(): ValmConfiguration
const full = config.getConfig();
// {
//   video: VideoConfiguration,
//   audio: AudioConfiguration,
//   screenShare: ScreenShareConfiguration,
//   recording: RecordingConfiguration,
//   transcription: TranscriptionConfiguration,
// }

// getVideoConfig(): VideoConfiguration
const video = config.getVideoConfig();

// getAudioConfig(): AudioConfiguration
const audio = config.getAudioConfig();

// getScreenShareConfig(): ScreenShareConfiguration
const screenShare = config.getScreenShareConfig();

// getRecordingConfig(): RecordingConfiguration
const recording = config.getRecordingConfig();

// getTranscriptionConfig(): TranscriptionConfiguration
const transcription = config.getTranscriptionConfig();
```

### Updating video

```typescript
// updateVideoConfig(updates: Partial<VideoConfiguration>): void
config.updateVideoConfig({
  resolution: { width: 1920, height: 1080 },
  frameRate: 30,
  enabled: true,
})

// setVideoResolution(width: number, height: number): void
config.setVideoResolution(1280, 720)
config.setVideoResolution(1920, 1080)

// setVideoFrameRate(frameRate: number): void
config.setVideoFrameRate(30)
config.setVideoFrameRate(60)

// setVideoDevice(deviceId: string | null): void
config.setVideoDevice('camera-device-id')  // select a specific device
config.setVideoDevice(null)                 // auto-select

// toggleVideoEnabled(): boolean  — returns the new enabled value
const isNowEnabled = config.toggleVideoEnabled()
```

### Updating audio

```typescript
// updateAudioConfig(updates: Partial<AudioConfiguration>): void
config.updateAudioConfig({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
  volumeThreshold: 20,    // volume threshold 0-100
})

// setAudioDevice(deviceId: string | null): void
config.setAudioDevice('mic-device-id')
config.setAudioDevice(null)  // auto-select

// setAudioProcessing(options): void
config.setAudioProcessing({
  echoCancellation: true,  // echo cancellation
  noiseSuppression: true,  // noise suppression
  autoGainControl: true,   // automatic gain control
})

// toggleAudioEnabled(): boolean
const isNowEnabled = config.toggleAudioEnabled()
```

### Updating screen share

```typescript
// updateScreenShareConfig(updates: Partial<ScreenShareConfiguration>): void
config.updateScreenShareConfig({
  preferDisplaySurface: 'window',   // 'monitor' | 'window' | 'application'
  includeAudio: true,               // capture system audio
  mode: 'video',                    // 'presentation' | 'video' — sets maxFrameRate and contentHint
  maxWidth: 1920,                   // width limit
  maxHeight: 1080,                  // height limit
  maxFrameRate: 15,                 // FPS limit (overrides the value from mode)
  contentHint: 'detail',           // 'motion' | 'detail' | 'text' | '' (overrides the value from mode)
})

// mode sets optimal maxFrameRate and contentHint:
// 'presentation' — 5 FPS, contentHint='text' (slides, documents — light on CPU)
// 'video'        — 30 FPS, contentHint='motion' (movies, games — smooth)
// Explicitly set maxFrameRate/contentHint override the values from mode.

// contentHint hints to the codec about the content type:
// 'motion'  — video, movies (prioritize smoothness)
// 'detail'  — presentations, UI (prioritize sharpness)
// 'text'    — text only (maximum sharpness)
```

### Updating recording

```typescript
// updateRecordingConfig(updates: Partial<RecordingConfiguration>): void
config.updateRecordingConfig({
  format: 'webm',            // 'webm' | 'mp4' | 'mkv'
  quality: 'high',           // 'low' | 'medium' | 'high' | 'custom'
  videoBitsPerSecond: 2_500_000,
  audioBitsPerSecond: 128_000,
})

// setRecordingFormat(format: 'webm' | 'mp4' | 'mkv'): void
config.setRecordingFormat('webm')

// setRecordingQuality(quality: 'low' | 'medium' | 'high' | 'custom'): void
config.setRecordingQuality('high')

// setRecordingBitrates(videoBitsPerSecond: number, audioBitsPerSecond: number): void
config.setRecordingBitrates(2_500_000, 128_000)

// setRecordingIncludes(options): void
config.setRecordingIncludes({
  includeVideo: true,        // include the video stream in the recording
  includeAudio: true,        // include the audio stream in the recording
  includeScreenShare: false, // include screen share in the recording
})

// setRecordingLimits(maxDuration: number, maxFileSize: number): void
// maxDuration — in seconds (0 = no limit)
// maxFileSize — in MB (0 = no limit)
config.setRecordingLimits(60, 500)   // 60 s, 500 MB
config.setRecordingLimits(0, 0)      // no limits

// toggleRecordingEnabled(): boolean
const isNowEnabled = config.toggleRecordingEnabled()
```

### Updating transcription

```typescript
// updateTranscriptionConfig(updates: Partial<TranscriptionConfiguration>): void
config.updateTranscriptionConfig({
  language: 'ru-RU',       // recognition language
  interimResults: true,    // show interim results
  autoStart: false,        // start automatically on initialization
  saveTranscripts: true,   // save transcript history
})

// setTranscriptionLanguage(language: string): void
config.setTranscriptionLanguage('en-US')
config.setTranscriptionLanguage('ru-RU')

// toggleTranscriptionEnabled(): boolean
const isNowEnabled = config.toggleTranscriptionEnabled()

// toggleTranscriptionAutoStart(): boolean
const isAutoStart = config.toggleTranscriptionAutoStart()
```

### Reset

```typescript
config.resetVideoConfig()        // reset video to defaults
config.resetAudioConfig()        // reset audio to defaults
config.resetRecordingConfig()    // reset recording to defaults
config.resetTranscriptionConfig() // reset transcription to defaults
config.resetAll()                // reset the entire configuration
```

### Import and export

```typescript
// exportConfig(): string  — serializes the configuration to a JSON string
const json = config.exportConfig()
localStorage.setItem('media-config', json)

// importConfig(configJson: string): void  — restores from a JSON string
const saved = localStorage.getItem('media-config')
if (saved) {
  config.importConfig(saved)
}
```

---

## Getters and state

### `ValmConfiguration`

```typescript
interface ValmConfiguration {
  video: VideoConfiguration
  audio: AudioConfiguration
  screenShare: ScreenShareConfiguration
  recording: RecordingConfiguration
  transcription: TranscriptionConfiguration
}
```

### `VideoConfiguration`

```typescript
interface VideoConfiguration {
  enabled: boolean              // whether video is on by default
  deviceId: string | null       // camera ID (null = auto-select)
  resolution: {
    width: number               // width in pixels
    height: number              // height in pixels
  }
  frameRate: number             // frames per second
  facingMode: 'user' | 'environment'  // front or rear camera
  constraints: MediaTrackConstraints  // additional constraints
}
```

### `AudioConfiguration`

```typescript
interface AudioConfiguration {
  enabled: boolean              // whether audio is on by default
  deviceId: string | null       // microphone ID (null = auto-select)
  echoCancellation: boolean     // echo cancellation
  noiseSuppression: boolean     // noise suppression
  autoGainControl: boolean      // automatic gain control
  enableSpeakingDetection: boolean  // speech detection by volume
  volumeThreshold: number       // volume threshold for speech detection (0–100)
  constraints: MediaTrackConstraints
}
```

### `ScreenShareConfiguration`

```typescript
type ScreenShareMode = 'presentation' | 'video'

interface ScreenShareConfiguration {
  preferDisplaySurface: 'monitor' | 'window' | 'application'
  includeAudio: boolean         // capture system audio
  mode?: ScreenShareMode        // broadcast mode — determines frameRate and contentHint
  maxWidth?: number             // width limit (undefined = no limit)
  maxHeight?: number            // height limit
  maxFrameRate?: number         // FPS limit (if unset — from mode)
  contentHint?: 'motion' | 'detail' | 'text' | '' // codec hint (if unset — from mode)
}
```

### `RecordingConfiguration`

```typescript
interface RecordingConfiguration {
  enabled: boolean
  format: 'webm' | 'mp4' | 'mkv'
  quality: 'low' | 'medium' | 'high' | 'custom'
  videoBitsPerSecond: number    // video bitrate
  audioBitsPerSecond: number    // audio bitrate
  includeVideo: boolean
  includeAudio: boolean
  includeScreenShare: boolean
  autoSave: boolean             // automatically save files
  saveDirectory?: string        // folder for auto-saving
  maxDuration: number           // maximum duration in seconds (0 = no limit)
  maxFileSize: number           // maximum file size in MB (0 = no limit)
  chunkInterval: number         // interval for creating chunks in ms
}
```

### `TranscriptionConfiguration`

```typescript
interface TranscriptionConfiguration {
  enabled: boolean
  autoStart: boolean            // start automatically on initialization
  language: string              // BCP-47 language code, e.g. 'en-US', 'ru-RU'
  interimResults: boolean       // show interim (non-final) results
  saveTranscripts: boolean      // save transcript history
}
```

---

## Subscriptions

All methods return an unsubscribe function.

```typescript
// onChange(callback): VoidFunction — any change in any section
const unsub = config.onChange((event: ConfigurationChangeEvent) => {
  // event.section    — 'video' | 'audio' | 'screenShare' | 'recording' | 'transcription'
  // event.property   — name of the changed property, e.g. 'frameRate'
  // event.oldValue   — previous value
  // event.newValue   — new value
  // event.timestamp  — event time in ms (Date.now())
  console.log(`[${event.section}] ${event.property}: ${event.oldValue} → ${event.newValue}`)
})

// Per-section changes — the same ConfigurationChangeEvent, but only for a specific section
config.onVideoChange((event: ConfigurationChangeEvent) => { ... })
config.onAudioChange((event: ConfigurationChangeEvent) => { ... })
config.onScreenShareChange((event: ConfigurationChangeEvent) => { ... })
config.onRecordingChange((event: ConfigurationChangeEvent) => { ... })
config.onTranscriptionChange((event: ConfigurationChangeEvent) => { ... })

// onReset(callback): VoidFunction — called after resetAll() or resetXxxConfig()
config.onReset((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — the configuration before the reset
  // data.newConfig — the configuration after the reset (default values)
  console.log('Config reset:', data.newConfig)
})

// onImport(callback): VoidFunction — called after importConfig()
config.onImport((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — the configuration before the import
  // data.newConfig — the imported configuration
  console.log('Config imported:', data.newConfig)
})

// onUpdate(callback): VoidFunction — any update (updateXxxConfig)
config.onUpdate((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — the configuration before the update
  // data.newConfig — the configuration after the update
})

unsub() // unsubscribe
```

### `ConfigurationChangeEvent`

```typescript
interface ConfigurationChangeEvent<T = any> {
  section: keyof ValmConfiguration  // 'video' | 'audio' | 'screenShare' | 'recording' | 'transcription'
  property: string    // the changed property, e.g. 'frameRate', 'deviceId'
  oldValue: T         // previous value
  newValue: T         // new value
  timestamp: number   // Date.now() at the moment of change
}
```

---

## Common scenarios

### Persisting user settings

```typescript
// On any change — save to localStorage
config.onChange(() => {
  localStorage.setItem('media-config', config.exportConfig())
})

// On startup — restore
const saved = localStorage.getItem('media-config')
if (saved) {
  config.importConfig(saved)
}
```

### Video quality presets

```typescript
function applyVideoPreset(preset: 'low' | 'medium' | 'high') {
  const presets = {
    low:    { width: 640,  height: 480,  frameRate: 15 },
    medium: { width: 1280, height: 720,  frameRate: 30 },
    high:   { width: 1920, height: 1080, frameRate: 30 },
  }
  const { width, height, frameRate } = presets[preset]
  config.setVideoResolution(width, height)
  config.setVideoFrameRate(frameRate)
}
```

### Logging changes of a specific section

```typescript
config.onVideoChange((event) => {
  console.log(`Video config changed: ${event.property} = ${event.newValue}`)
})

config.onAudioChange((event) => {
  if (event.property === 'deviceId') {
    console.log('Microphone switched to:', event.newValue)
  }
})
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `getConfig()` | `ValmConfiguration` | Full configuration |
| `getVideoConfig()` | `VideoConfiguration` | Video config |
| `getAudioConfig()` | `AudioConfiguration` | Audio config |
| `getScreenShareConfig()` | `ScreenShareConfiguration` | Screen share config |
| `getRecordingConfig()` | `RecordingConfiguration` | Recording config |
| `getTranscriptionConfig()` | `TranscriptionConfiguration` | Transcription config |
| `updateVideoConfig(updates)` | `void` | Update the video config |
| `updateAudioConfig(updates)` | `void` | Update the audio config |
| `updateScreenShareConfig(updates)` | `void` | Update the screen share config |
| `updateRecordingConfig(updates)` | `void` | Update the recording config |
| `updateTranscriptionConfig(updates)` | `void` | Update the transcription config |
| `setVideoResolution(w, h)` | `void` | Set the resolution |
| `setVideoFrameRate(fps)` | `void` | Set the frame rate |
| `setVideoDevice(deviceId)` | `void` | Select a camera |
| `toggleVideoEnabled()` | `boolean` | Toggle video, return the new value |
| `setAudioDevice(deviceId)` | `void` | Select a microphone |
| `setAudioProcessing(options)` | `void` | Configure audio processing |
| `toggleAudioEnabled()` | `boolean` | Toggle audio, return the new value |
| `setTranscriptionLanguage(lang)` | `void` | Set the recognition language |
| `toggleTranscriptionEnabled()` | `boolean` | Toggle transcription |
| `toggleTranscriptionAutoStart()` | `boolean` | Toggle auto-start |
| `setRecordingFormat(format)` | `void` | Set the recording format |
| `setRecordingQuality(quality)` | `void` | Set the quality |
| `setRecordingBitrates(video, audio)` | `void` | Set the bitrates |
| `setRecordingIncludes(options)` | `void` | What to include in the recording |
| `setRecordingLimits(duration, size)` | `void` | Recording limits |
| `toggleRecordingEnabled()` | `boolean` | Toggle recording |
| `resetVideoConfig()` | `void` | Reset video to defaults |
| `resetAudioConfig()` | `void` | Reset audio to defaults |
| `resetRecordingConfig()` | `void` | Reset recording to defaults |
| `resetTranscriptionConfig()` | `void` | Reset transcription to defaults |
| `resetAll()` | `void` | Reset the entire configuration |
| `exportConfig()` | `string` | Export to a JSON string |
| `importConfig(json)` | `void` | Import from a JSON string |
| `onChange(cb)` | `VoidFunction` | Any configuration change |
| `onVideoChange(cb)` | `VoidFunction` | Changes in the video section |
| `onAudioChange(cb)` | `VoidFunction` | Changes in the audio section |
| `onScreenShareChange(cb)` | `VoidFunction` | Changes in screen share |
| `onRecordingChange(cb)` | `VoidFunction` | Changes in recording |
| `onTranscriptionChange(cb)` | `VoidFunction` | Changes in transcription |
| `onReset(cb)` | `VoidFunction` | Configuration reset |
| `onImport(cb)` | `VoidFunction` | Configuration import |
| `onUpdate(cb)` | `VoidFunction` | Any update (updateXxx) |
| `destroy()` | `void` | Remove all subscriptions |
