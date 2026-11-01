# Getting Started

## Установка

```bash
yarn add valm-js
```

## Быстрый старт

::::tabs
:::tab{title="Камера и микрофон"}
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
:::
:::tab{title="Перевод голоса"}
Голос говорящего переводится на выбранный язык, перевод заменяет микрофон в публикуемой дорожке. Ключ Gemini
вводит пользователь: он остаётся в браузере (получить — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) →
**Create API key**). По умолчанию перевод выключен — включайте по действию пользователя.

```typescript
import { Valm } from 'valm-js'
import { VoiceTranslatePlugin, GeminiLiveTranslateTransport } from 'valm-js/voice-translate'

const media = new Valm({ audio: { enabled: true } }).use(new VoiceTranslatePlugin())
await media.initialize()

const translate = media.voiceTranslateController
await translate.enable({
  transport: new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey: userKey } }),
  targetLanguage: 'en', // язык говорящего определяется сам
})

translate.onStateChange((s) => console.log(s.status))          // idle | connecting | active | error
translate.onAny(({ type, payload }) => console.log(type, payload)) // все события

// В звонок — как обычно: дорожка микрофона уже несёт перевод
const track = media.microphoneController.getTrack()
```

Ключ шаг за шагом, лимиты, ошибки, события и свой провайдер — [Voice Translate](./voice-translate.md).
:::
::::

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
├── voiceTranslateController — перевод голоса (требует VoiceTranslatePlugin)
└── permissions             — разрешения браузера
```

Каждый контроллер отвечает за свою область и предоставляет независимый API. Подробнее — в соответствующих разделах документации.
