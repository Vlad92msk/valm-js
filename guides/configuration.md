# ConfigurationController

Централизованное управление конфигурацией: чтение по секциям, обновление, сброс к дефолтам, импорт/экспорт.

## Доступ

```typescript
const config = media.configurationController;
```

---

## Действия

### Чтение конфигурации

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

### Обновление видео

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
config.setVideoDevice('camera-device-id')  // выбрать конкретное устройство
config.setVideoDevice(null)                 // автовыбор

// toggleVideoEnabled(): boolean  — возвращает новое значение enabled
const isNowEnabled = config.toggleVideoEnabled()
```

### Обновление аудио

```typescript
// updateAudioConfig(updates: Partial<AudioConfiguration>): void
config.updateAudioConfig({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
  volumeThreshold: 20,    // порог громкости 0-100
})

// setAudioDevice(deviceId: string | null): void
config.setAudioDevice('mic-device-id')
config.setAudioDevice(null)  // автовыбор

// setAudioProcessing(options): void
config.setAudioProcessing({
  echoCancellation: true,  // подавление эха
  noiseSuppression: true,  // шумоподавление
  autoGainControl: true,   // автоматическая регулировка усиления
})

// toggleAudioEnabled(): boolean
const isNowEnabled = config.toggleAudioEnabled()
```

### Обновление screen share

```typescript
// updateScreenShareConfig(updates: Partial<ScreenShareConfiguration>): void
config.updateScreenShareConfig({
  preferDisplaySurface: 'window',   // 'monitor' | 'window' | 'application'
  includeAudio: true,               // захватывать системный звук
  maxWidth: 1920,                   // ограничение ширины
  maxHeight: 1080,                  // ограничение высоты
  maxFrameRate: 15,                 // ограничение FPS
  contentHint: 'detail',           // 'motion' | 'detail' | 'text' | ''
})

// contentHint подсказывает кодеку тип контента:
// 'motion'  — видео, фильмы (приоритет плавности)
// 'detail'  — презентации, UI (приоритет чёткости)
// 'text'    — только текст (максимальная чёткость)
```

### Обновление записи

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
  includeVideo: true,        // включить видеопоток в запись
  includeAudio: true,        // включить аудиопоток в запись
  includeScreenShare: false, // включить screen share в запись
})

// setRecordingLimits(maxDuration: number, maxFileSize: number): void
// maxDuration — в минутах (0 = без ограничений)
// maxFileSize — в MB (0 = без ограничений)
config.setRecordingLimits(60, 500)   // 60 мин, 500 MB
config.setRecordingLimits(0, 0)      // без ограничений

// toggleRecordingEnabled(): boolean
const isNowEnabled = config.toggleRecordingEnabled()
```

### Обновление транскрипции

```typescript
// updateTranscriptionConfig(updates: Partial<TranscriptionConfiguration>): void
config.updateTranscriptionConfig({
  language: 'ru-RU',       // язык распознавания
  interimResults: true,    // показывать промежуточные результаты
  autoStart: false,        // автоматически стартовать при инициализации
  saveTranscripts: true,   // сохранять историю транскриптов
})

// setTranscriptionLanguage(language: string): void
config.setTranscriptionLanguage('en-US')
config.setTranscriptionLanguage('ru-RU')

// toggleTranscriptionEnabled(): boolean
const isNowEnabled = config.toggleTranscriptionEnabled()

// toggleTranscriptionAutoStart(): boolean
const isAutoStart = config.toggleTranscriptionAutoStart()
```

### Сброс

```typescript
config.resetVideoConfig()        // сброс видео к дефолтам
config.resetAudioConfig()        // сброс аудио к дефолтам
config.resetRecordingConfig()    // сброс записи к дефолтам
config.resetTranscriptionConfig() // сброс транскрипции к дефолтам
config.resetAll()                // сброс всей конфигурации
```

### Импорт и экспорт

```typescript
// exportConfig(): string  — сериализует конфигурацию в JSON-строку
const json = config.exportConfig()
localStorage.setItem('media-config', json)

// importConfig(configJson: string): void  — восстанавливает из JSON-строки
const saved = localStorage.getItem('media-config')
if (saved) {
  config.importConfig(saved)
}
```

---

## Геттеры и состояние

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
  enabled: boolean              // включено ли видео по умолчанию
  deviceId: string | null       // ID камеры (null = автовыбор)
  resolution: {
    width: number               // ширина в пикселях
    height: number              // высота в пикселях
  }
  frameRate: number             // частота кадров в секунду
  facingMode: 'user' | 'environment'  // фронтальная или задняя камера
  constraints: MediaTrackConstraints  // дополнительные ограничения
}
```

### `AudioConfiguration`

```typescript
interface AudioConfiguration {
  enabled: boolean              // включён ли звук по умолчанию
  deviceId: string | null       // ID микрофона (null = автовыбор)
  echoCancellation: boolean     // подавление эха
  noiseSuppression: boolean     // шумоподавление
  autoGainControl: boolean      // автоматическая регулировка усиления
  enableSpeakingDetection: boolean  // детекция речи по громкости
  volumeThreshold: number       // порог громкости для детекции речи (0–100)
  constraints: MediaTrackConstraints
}
```

### `ScreenShareConfiguration`

```typescript
interface ScreenShareConfiguration {
  preferDisplaySurface: 'monitor' | 'window' | 'application'
  includeAudio: boolean         // захватывать системный звук
  maxWidth?: number             // ограничение ширины (undefined = без ограничений)
  maxHeight?: number            // ограничение высоты
  maxFrameRate?: number         // ограничение FPS
  contentHint?: 'motion' | 'detail' | 'text' | ''
}
```

### `RecordingConfiguration`

```typescript
interface RecordingConfiguration {
  enabled: boolean
  format: 'webm' | 'mp4' | 'mkv'
  quality: 'low' | 'medium' | 'high' | 'custom'
  videoBitsPerSecond: number    // битрейт видео
  audioBitsPerSecond: number    // битрейт аудио
  includeVideo: boolean
  includeAudio: boolean
  includeScreenShare: boolean
  autoSave: boolean             // автоматически сохранять файлы
  saveDirectory?: string        // папка для автосохранения
  maxDuration: number           // максимальная длительность в минутах (0 = без ограничений)
  maxFileSize: number           // максимальный размер файла в MB (0 = без ограничений)
  chunkInterval: number         // интервал для создания чанков в мс
}
```

### `TranscriptionConfiguration`

```typescript
interface TranscriptionConfiguration {
  enabled: boolean
  autoStart: boolean            // автоматически стартовать при инициализации
  language: string              // BCP-47 код языка, например 'en-US', 'ru-RU'
  interimResults: boolean       // показывать промежуточные (не финальные) результаты
  saveTranscripts: boolean      // сохранять историю транскриптов
}
```

---

## Подписки

Все методы возвращают функцию отписки.

```typescript
// onChange(callback): VoidFunction — любое изменение любой секции
const unsub = config.onChange((event: ConfigurationChangeEvent) => {
  // event.section    — 'video' | 'audio' | 'screenShare' | 'recording' | 'transcription'
  // event.property   — имя изменённого свойства, например 'frameRate'
  // event.oldValue   — предыдущее значение
  // event.newValue   — новое значение
  // event.timestamp  — время события в ms (Date.now())
  console.log(`[${event.section}] ${event.property}: ${event.oldValue} → ${event.newValue}`)
})

// Изменения по секциям — те же ConfigurationChangeEvent, но только для конкретной секции
config.onVideoChange((event: ConfigurationChangeEvent) => { ... })
config.onAudioChange((event: ConfigurationChangeEvent) => { ... })
config.onScreenShareChange((event: ConfigurationChangeEvent) => { ... })
config.onRecordingChange((event: ConfigurationChangeEvent) => { ... })
config.onTranscriptionChange((event: ConfigurationChangeEvent) => { ... })

// onReset(callback): VoidFunction — вызывается после resetAll() или resetXxxConfig()
config.onReset((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — конфигурация до сброса
  // data.newConfig — конфигурация после сброса (дефолтные значения)
  console.log('Config reset:', data.newConfig)
})

// onImport(callback): VoidFunction — вызывается после importConfig()
config.onImport((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — конфигурация до импорта
  // data.newConfig — импортированная конфигурация
  console.log('Config imported:', data.newConfig)
})

// onUpdate(callback): VoidFunction — любое обновление (updateXxxConfig)
config.onUpdate((data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => {
  // data.oldConfig — конфигурация до обновления
  // data.newConfig — конфигурация после обновления
})

unsub() // отписка
```

### `ConfigurationChangeEvent`

```typescript
interface ConfigurationChangeEvent<T = any> {
  section: keyof ValmConfiguration  // 'video' | 'audio' | 'screenShare' | 'recording' | 'transcription'
  property: string    // изменённое свойство, например 'frameRate', 'deviceId'
  oldValue: T         // предыдущее значение
  newValue: T         // новое значение
  timestamp: number   // Date.now() в момент изменения
}
```

---

## Типичные сценарии

### Сохранение настроек пользователя

```typescript
// При любом изменении — сохранять в localStorage
config.onChange(() => {
  localStorage.setItem('media-config', config.exportConfig())
})

// При старте — восстановить
const saved = localStorage.getItem('media-config')
if (saved) {
  config.importConfig(saved)
}
```

### Пресеты качества видео

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

### Логирование изменений конкретной секции

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

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `getConfig()` | `ValmConfiguration` | Полная конфигурация |
| `getVideoConfig()` | `VideoConfiguration` | Видео-конфиг |
| `getAudioConfig()` | `AudioConfiguration` | Аудио-конфиг |
| `getScreenShareConfig()` | `ScreenShareConfiguration` | Конфиг screen share |
| `getRecordingConfig()` | `RecordingConfiguration` | Конфиг записи |
| `getTranscriptionConfig()` | `TranscriptionConfiguration` | Конфиг транскрипции |
| `updateVideoConfig(updates)` | `void` | Обновить видео-конфиг |
| `updateAudioConfig(updates)` | `void` | Обновить аудио-конфиг |
| `updateScreenShareConfig(updates)` | `void` | Обновить конфиг screen share |
| `updateRecordingConfig(updates)` | `void` | Обновить конфиг записи |
| `updateTranscriptionConfig(updates)` | `void` | Обновить конфиг транскрипции |
| `setVideoResolution(w, h)` | `void` | Установить разрешение |
| `setVideoFrameRate(fps)` | `void` | Установить частоту кадров |
| `setVideoDevice(deviceId)` | `void` | Выбрать камеру |
| `toggleVideoEnabled()` | `boolean` | Переключить видео, вернуть новое значение |
| `setAudioDevice(deviceId)` | `void` | Выбрать микрофон |
| `setAudioProcessing(options)` | `void` | Настроить обработку звука |
| `toggleAudioEnabled()` | `boolean` | Переключить аудио, вернуть новое значение |
| `setTranscriptionLanguage(lang)` | `void` | Установить язык распознавания |
| `toggleTranscriptionEnabled()` | `boolean` | Переключить транскрипцию |
| `toggleTranscriptionAutoStart()` | `boolean` | Переключить автостарт |
| `setRecordingFormat(format)` | `void` | Установить формат записи |
| `setRecordingQuality(quality)` | `void` | Установить качество |
| `setRecordingBitrates(video, audio)` | `void` | Установить битрейты |
| `setRecordingIncludes(options)` | `void` | Что включать в запись |
| `setRecordingLimits(duration, size)` | `void` | Ограничения записи |
| `toggleRecordingEnabled()` | `boolean` | Переключить запись |
| `resetVideoConfig()` | `void` | Сбросить видео к дефолтам |
| `resetAudioConfig()` | `void` | Сбросить аудио к дефолтам |
| `resetRecordingConfig()` | `void` | Сбросить запись к дефолтам |
| `resetTranscriptionConfig()` | `void` | Сбросить транскрипцию к дефолтам |
| `resetAll()` | `void` | Сбросить всю конфигурацию |
| `exportConfig()` | `string` | Экспорт в JSON-строку |
| `importConfig(json)` | `void` | Импорт из JSON-строки |
| `onChange(cb)` | `VoidFunction` | Любое изменение конфигурации |
| `onVideoChange(cb)` | `VoidFunction` | Изменения в видео-секции |
| `onAudioChange(cb)` | `VoidFunction` | Изменения в аудио-секции |
| `onScreenShareChange(cb)` | `VoidFunction` | Изменения в screen share |
| `onRecordingChange(cb)` | `VoidFunction` | Изменения в записи |
| `onTranscriptionChange(cb)` | `VoidFunction` | Изменения в транскрипции |
| `onReset(cb)` | `VoidFunction` | Сброс конфигурации |
| `onImport(cb)` | `VoidFunction` | Импорт конфигурации |
| `onUpdate(cb)` | `VoidFunction` | Любое обновление (updateXxx) |
| `destroy()` | `void` | Снять все подписки |
