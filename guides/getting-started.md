# Getting Started

## Установка

```bash
yarn add valm
```

## Быстрый старт

```typescript
import { Valm } from 'valm-js'

const media = new Valm({
  video: { enabled: true },
  audio: { enabled: true },
})

await media.initialize()

// Получить MediaStream для <video> элемента
const stream = media.cameraController.getStream()
videoElement.srcObject = stream
```

## Конфигурация

Все поля опциональны — неуказанные принимают значения по умолчанию.

```typescript
const media = new Valm({
  video: {
    enabled: true,
    deviceId: null,              // null = автовыбор устройства
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
    facingMode: 'user',          // 'user' | 'environment'
    constraints: {},             // дополнительные MediaTrackConstraints
  },

  audio: {
    enabled: true,
    deviceId: null,              // null = автовыбор устройства
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    enableSpeakingDetection: false,
    volumeThreshold: 10,         // порог детекции речи (0–100)
    constraints: {},             // дополнительные MediaTrackConstraints
  },

  screenShare: {
    preferDisplaySurface: 'monitor',  // 'monitor' | 'window' | 'application'
    includeAudio: false,
    maxWidth: undefined,
    maxHeight: undefined,
    maxFrameRate: undefined,
    contentHint: 'detail',      // 'motion' | 'detail' | 'text' | ''
  },

  recording: {
    enabled: false,
    format: 'webm',             // 'webm' | 'mp4' | 'mkv'
    quality: 'medium',          // 'low' | 'medium' | 'high' | 'custom'
    videoBitsPerSecond: 2500,   // kbps
    audioBitsPerSecond: 128,    // kbps
    includeVideo: true,
    includeAudio: true,
    includeScreenShare: false,
    autoSave: false,
    maxDuration: 0,             // минуты, 0 = без ограничений
    maxFileSize: 0,             // MB, 0 = без ограничений
    chunkInterval: 1000,        // интервал чанков, мс
  },

  transcription: {
    enabled: false,
    autoStart: false,
    language: 'en-US',
    interimResults: true,
    saveTranscripts: false,
  },
  autoInitialize: false,        // вызвать initialize() в конструкторе
})
```

## Архитектура

```
Valm
├── cameraController        — камера
├── microphoneController    — микрофон
├── devicesController       — список устройств
├── audioOutputController   — выбор динамика
├── screenShareController   — демонстрация экрана
├── recordingController     — запись
├── transcriptionController — транскрипция
├── configurationController — конфигурация
├── effectsController       — видеоэффекты (требует EffectsPlugin)
└── permissions             — разрешения браузера
```

Каждый контроллер отвечает за свою область и предоставляет независимый API. Подробнее — в соответствующих разделах документации.
