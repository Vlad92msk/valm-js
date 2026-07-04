# RecordingController

Managing media recording: start/stop/pause, formats, limits, chunks, saving utilities.

## Access

```typescript
import { Valm } from 'valm-js'

const media = new Valm(config)
await media.initializeMedia()

const recording = media.recordingController
```

---

## Actions

### Recording

```typescript
// startRecording(options?: RecordingOptions): Promise<void>
await recording.startRecording()           // with default settings

await recording.startRecording({
  mimeType: 'video/webm;codecs=vp9,opus',  // explicitly set the MIME type (otherwise chosen automatically)
  format: 'webm',                          // 'webm' | 'mp4' | 'mkv' — preferred format
  quality: 'high',                         // 'low' | 'medium' | 'high' | 'custom' — bitrate preset
  videoBitsPerSecond: 5_000_000,           // video bitrate in bps (only with quality: 'custom')
  audioBitsPerSecond: 256_000,             // audio bitrate in bps (only with quality: 'custom')
  includeVideo: true,                      // include the camera video track
  includeAudio: true,                      // include the microphone audio track
  includeScreenShare: false,               // include the screen-share track
  maxDuration: 60,                         // maximum duration in seconds (0 = no limit)
  maxFileSize: 500,                        // maximum file size in MB (0 = no limit)
  chunkInterval: 1000,                     // chunk interval in ms (how often onRecordingData fires)
  autoSave: false,                         // automatically download the file when stopped
})

// stopRecording(): Promise<Blob>
const blob = await recording.stopRecording()  // stop and get the final Blob
```

### Quality presets

| Preset | videoBitsPerSecond | audioBitsPerSecond |
|--------|-------------------|-------------------|
| `low`  | 1 Mbps            | 64 kbps           |
| `medium` | 2.5 Mbps        | 128 kbps          |
| `high` | 5 Mbps            | 256 kbps          |
| `custom` | set manually    | set manually      |

### Pause and resume

```typescript
// pauseRecording(): void
recording.pauseRecording()    // pause (only during active recording)

// resumeRecording(): void
recording.resumeRecording()   // resume (only if recording is paused)
```

---

## Getters and state

```typescript
recording.state  // RecordingState — current state (getter)
```

### `RecordingState`

```typescript
interface RecordingState {
  isRecording: boolean  // true — recording in progress (not paused)
  isPaused: boolean     // true — recording is paused
  duration: number      // recording duration in ms (pause not counted)
  fileSize: number      // accumulated size in bytes
  format: string        // MIME type of the active MediaRecorder (e.g. 'video/webm;codecs=vp9,opus')
  quality: string       // current quality preset: 'low' | 'medium' | 'high' | 'custom'
}
```

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
// onStateChange(cb): VoidFunction
const unsub = recording.onStateChange((state: RecordingState) => {
  // state.isRecording: boolean — recording active
  // state.isPaused: boolean   — recording paused
  // state.duration: number    — duration in ms
  // state.fileSize: number    — size of accumulated data in bytes
  // state.format: string      — MIME type (e.g. 'video/webm;codecs=vp9,opus')
  // state.quality: string     — quality preset
  timerEl.textContent = formatDuration(state.duration)
  sizeEl.textContent = formatBytes(state.fileSize)
})
unsub()  // unsubscribe

// onRecordingStopped(cb): VoidFunction
// called after a full stop — receives the ready Blob and utilities
recording.onRecordingStopped((blob: Blob, utils: RecordingUtils) => {
  // blob — the complete recording file
  // utils.downloadBlob(blob, filename?)      — download via the browser
  // utils.createObjectURL(blob)              — create a URL for <video src>
  // utils.uploadBlob(blob, endpoint)         — POST to a server as FormData
  // utils.saveToIndexedDB(blob, key)         — save to IndexedDB
  // utils.getFileExtension(blob.type)        — get the extension: 'webm' | 'mp4' | 'mkv'
  utils.downloadBlob(blob, `meeting-${Date.now()}.webm`)
})

// onRecordingData(cb): VoidFunction
// called every chunkInterval ms — for streaming or a progress bar
recording.onRecordingData((data: { chunk: Blob; totalSize: number; duration: number }) => {
  // data.chunk: Blob       — the next recording chunk
  // data.totalSize: number — total size of all chunks in bytes
  // data.duration: number  — current recording duration in ms
  progressBar.value = (data.totalSize / maxFileSizeBytes) * 100
})

// onRecordingLimitReached(cb): VoidFunction
// called when recording is automatically stopped due to exceeding a limit
recording.onRecordingLimitReached((data: { type: 'duration' | 'fileSize'; limit: number }) => {
  // data.type: 'duration' | 'fileSize' — which limit triggered
  // data.limit: number                 — the limit value (seconds or MB)
  if (data.type === 'duration') {
    showNotification(`Time limit reached: ${data.limit} s`)
  } else {
    showNotification(`Size limit reached: ${data.limit} MB`)
  }
})

// onError(cb): VoidFunction
recording.onError((error: unknown) => {
  console.error('Recording error:', error)
})
```

### `RecordingUtils`

```typescript
interface RecordingUtils {
  downloadBlob: (blob: Blob, filename?: string) => void
  // Creates a temporary link and triggers a download.
  // filename — the file name (default: recording-<timestamp>.<ext>)

  createObjectURL: (blob: Blob) => string
  // Returns a blob: URL for use in <video src>.
  // Release the URL via URL.revokeObjectURL() after use.

  uploadBlob: (blob: Blob, endpoint: string) => Promise<Response>
  // POST request: the blob is sent as FormData['recording'].

  saveToIndexedDB: (blob: Blob, key: string) => Promise<void>
  // Saves to the 'files' objectStore of the 'recordings' database.

  getFileExtension: (mimeType: string) => string
  // 'video/webm...' → 'webm', 'video/mp4...' → 'mp4', 'video/x-matroska...' → 'mkv'
}
```

---

## Common scenarios

### Recording a call with auto-download

```typescript
await recording.startRecording({
  includeVideo: true,
  includeAudio: true,
  quality: 'high',
})

// Recording indicator
recording.onStateChange((state) => {
  recDot.classList.toggle('active', state.isRecording)
  recTimer.textContent = formatDuration(state.duration)
})

// Stop on button
stopBtn.onclick = () => recording.stopRecording()

// Download the ready file
recording.onRecordingStopped((blob, utils) => {
  utils.downloadBlob(blob, `meeting-${Date.now()}.webm`)
})
```

### Recording with limits

```typescript
await recording.startRecording({
  maxDuration: 3600,   // 1 hour
  maxFileSize: 500,    // 500 MB
})

recording.onRecordingLimitReached(({ type, limit }) => {
  const reason = type === 'duration' ? `${limit} s` : `${limit} MB`
  showNotification(`Recording stopped: limit reached (${reason})`)
})
```

### Streaming chunks to a server

```typescript
await recording.startRecording({ chunkInterval: 5000 })

recording.onRecordingData(async ({ chunk }) => {
  await fetch('/api/stream', {
    method: 'POST',
    body: chunk,
    headers: { 'Content-Type': chunk.type },
  })
})
```

### Playback after recording

```typescript
recording.onRecordingStopped((blob, utils) => {
  const url = utils.createObjectURL(blob)
  videoPlayer.src = url
  videoPlayer.onloadeddata = () => URL.revokeObjectURL(url)
})

await recording.startRecording()
// ... the user records
await recording.stopRecording()
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `startRecording(opts?)` | `Promise<void>` | Start recording |
| `stopRecording()` | `Promise<Blob>` | Stop and get the Blob |
| `pauseRecording()` | `void` | Pause |
| `resumeRecording()` | `void` | Resume after a pause |
| `state` | `RecordingState` | Current state (getter) |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to state changes |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
| `onRecordingStopped(cb)` | `VoidFunction` | Called on stop, passes the Blob and utilities |
| `onRecordingData(cb)` | `VoidFunction` | Called every `chunkInterval` ms |
| `onRecordingLimitReached(cb)` | `VoidFunction` | Called when a limit is reached (duration or fileSize) |
