# Getting Started

## Установка

```bash
yarn add valm-js
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
    enableSpeakingDetection: true,
    volumeThreshold: 10,         // порог детекции речи (0–100)
    constraints: {},             // дополнительные MediaTrackConstraints
  },

  screenShare: {
    preferDisplaySurface: 'monitor',  // 'monitor' | 'window' | 'application'
    includeAudio: false,
    mode: 'presentation',        // 'presentation' | 'video' — задаёт maxFrameRate и contentHint
    maxWidth: undefined,
    maxHeight: undefined,
    maxFrameRate: undefined,     // если не задано — берётся из mode
    contentHint: undefined,      // 'motion' | 'detail' | 'text' | '' — если не задано, берётся из mode
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
    autoSave: true,             // автоскачивание файла при остановке записи
    maxDuration: 0,             // секунды, 0 = без ограничений
    maxFileSize: 0,             // MB, 0 = без ограничений
    chunkInterval: 1000,        // интервал чанков, мс
  },

  transcription: {
    enabled: false,
    autoStart: false,
    language: 'ru-RU',
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
