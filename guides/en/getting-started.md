# Getting Started

## Installation

```bash
yarn add valm-js
```

## Quick start

::::tabs
:::tab{title="Camera and microphone"}
```typescript
import { Valm } from 'valm-js'

const media = new Valm({
  video: { enabled: true },
  audio: { enabled: true },
})

await media.initialize()

// Get a MediaStream for a <video> element
const stream = media.cameraController.getStream()
videoElement.srcObject = stream
```
:::
:::tab{title="Voice translation"}
The speaker's voice is translated into the chosen language and the translation replaces the microphone in the
published track. The user enters a Gemini key; it stays in the browser (get one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**). Translation is off by
default — enable it on a user action.

```typescript
import { Valm } from 'valm-js'
import { VoiceTranslatePlugin, GeminiLiveTranslateTransport } from 'valm-js/voice-translate'

const media = new Valm({ audio: { enabled: true } }).use(new VoiceTranslatePlugin())
await media.initialize()

const translate = media.voiceTranslateController
await translate.enable({
  transport: new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey: userKey } }),
  targetLanguage: 'en', // the speaker's language is detected automatically
})

translate.onStateChange((s) => console.log(s.status))          // idle | connecting | active | error
translate.onAny(({ type, payload }) => console.log(type, payload)) // every event

// For a call — as usual: the microphone track already carries the translation
const track = media.microphoneController.getTrack()
```

The key step by step, limits, errors, events and custom providers — [Voice Translate](./voice-translate.md).
:::
::::

## Configuration

All fields are optional — anything omitted falls back to its default value.

```typescript
const media = new Valm({
  video: {
    enabled: true,
    deviceId: null,              // null = auto-select device
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
    facingMode: 'user',          // 'user' | 'environment'
    constraints: {},             // additional MediaTrackConstraints
  },

  audio: {
    enabled: true,
    deviceId: null,              // null = auto-select device
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    enableSpeakingDetection: true,
    volumeThreshold: 10,         // speech-detection threshold (0–100)
    constraints: {},             // additional MediaTrackConstraints
  },

  screenShare: {
    preferDisplaySurface: 'monitor',  // 'monitor' | 'window' | 'application'
    includeAudio: false,
    mode: 'presentation',        // 'presentation' | 'video' — sets maxFrameRate and contentHint
    maxWidth: undefined,
    maxHeight: undefined,
    maxFrameRate: undefined,     // if unset — taken from mode
    contentHint: undefined,      // 'motion' | 'detail' | 'text' | '' — if unset, taken from mode
  },

  recording: {
    enabled: false,
    format: 'webm',             // 'webm' | 'mp4' | 'mkv'
    quality: 'medium',          // 'low' | 'medium' | 'high' | 'custom'
    videoBitsPerSecond: 2500000, // bps (2.5 Mbps)
    audioBitsPerSecond: 128000,  // bps (128 kbps)
    includeVideo: true,
    includeAudio: true,
    includeScreenShare: false,
    autoSave: true,             // auto-download the file when recording stops
    maxDuration: 0,             // seconds, 0 = no limit
    maxFileSize: 0,             // MB, 0 = no limit
    chunkInterval: 1000,        // chunk interval, ms
  },

  transcription: {
    enabled: false,
    autoStart: false,
    language: 'ru-RU',
    interimResults: true,
    saveTranscripts: false,
  },
  autoInitialize: false,        // call initialize() in the constructor
})
```

## Architecture

```
Valm
├── cameraController        — camera
├── microphoneController    — microphone
├── devicesController       — device list
├── audioOutputController   — speaker selection
├── screenShareController   — screen sharing
├── recordingController     — recording
├── transcriptionController — transcription
├── configurationController — configuration
├── effectsController       — video effects (requires EffectsPlugin)
├── voiceTranslateController — voice translation (requires VoiceTranslatePlugin)
└── permissions             — browser permissions
```

Each controller owns its own area and exposes an independent API. See the corresponding sections of the documentation for details.
