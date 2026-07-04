# Getting Started

## Installation

```bash
yarn add valm-js
```

## Quick start

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
└── permissions             — browser permissions
```

Each controller owns its own area and exposes an independent API. See the corresponding sections of the documentation for details.
