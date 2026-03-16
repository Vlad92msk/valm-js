# RecordingController

Управление записью медиа: старт/стоп/пауза, форматы, ограничения, чанки, утилиты для сохранения.

## Доступ

```typescript
import { Valm } from 'valm-js'

const media = new Valm(config)
await media.initializeMedia()

const recording = media.recordingController
```

---

## Действия

### Запись

```typescript
// startRecording(options?: RecordingOptions): Promise<void>
await recording.startRecording()           // с настройками по умолчанию

await recording.startRecording({
  mimeType: 'video/webm;codecs=vp9,opus',  // явно задать MIME-тип (иначе выбирается автоматически)
  format: 'webm',                          // 'webm' | 'mp4' | 'mkv' — предпочтительный формат
  quality: 'high',                         // 'low' | 'medium' | 'high' | 'custom' — пресет битрейта
  videoBitsPerSecond: 5_000_000,           // битрейт видео в bps (только при quality: 'custom')
  audioBitsPerSecond: 256_000,             // битрейт аудио в bps (только при quality: 'custom')
  includeVideo: true,                      // включить видеодорожку с камеры
  includeAudio: true,                      // включить аудиодорожку с микрофона
  includeScreenShare: false,               // включить дорожку со скриншеринга
  maxDuration: 60,                         // максимальная длительность в секундах (0 = без лимита)
  maxFileSize: 500,                        // максимальный размер файла в MB (0 = без лимита)
  chunkInterval: 1000,                     // интервал чанков в мс (как часто срабатывает onRecordingData)
  autoSave: false,                         // автоматически скачать файл при остановке
})

// stopRecording(): Promise<Blob>
const blob = await recording.stopRecording()  // остановить и получить итоговый Blob
```

### Пресеты качества

| Пресет | videoBitsPerSecond | audioBitsPerSecond |
|--------|-------------------|-------------------|
| `low`  | 1 Mbps            | 64 kbps           |
| `medium` | 2.5 Mbps        | 128 kbps          |
| `high` | 5 Mbps            | 256 kbps          |
| `custom` | задаётся вручную | задаётся вручную |

### Пауза и возобновление

```typescript
// pauseRecording(): void
recording.pauseRecording()    // пауза (только во время активной записи)

// resumeRecording(): void
recording.resumeRecording()   // продолжить (только если запись на паузе)
```

---

## Геттеры и состояние

```typescript
recording.state  // RecordingState — текущее состояние (геттер)
```

### `RecordingState`

```typescript
interface RecordingState {
  isRecording: boolean  // true — запись идёт (не на паузе)
  isPaused: boolean     // true — запись на паузе
  duration: number      // длительность записи в мс (пауза не учитывается)
  fileSize: number      // накопленный размер в байтах
  format: string        // MIME-тип активного MediaRecorder (напр. 'video/webm;codecs=vp9,opus')
  quality: string       // текущий пресет качества: 'low' | 'medium' | 'high' | 'custom'
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
// onStateChange(cb): VoidFunction
const unsub = recording.onStateChange((state: RecordingState) => {
  // state.isRecording: boolean — запись активна
  // state.isPaused: boolean   — запись на паузе
  // state.duration: number    — длительность в мс
  // state.fileSize: number    — размер накопленных данных в байтах
  // state.format: string      — MIME-тип (напр. 'video/webm;codecs=vp9,opus')
  // state.quality: string     — пресет качества
  timerEl.textContent = formatDuration(state.duration)
  sizeEl.textContent = formatBytes(state.fileSize)
})
unsub()  // отписка

// onRecordingStopped(cb): VoidFunction
// вызывается после полной остановки — получает готовый Blob и утилиты
recording.onRecordingStopped((blob: Blob, utils: RecordingUtils) => {
  // blob — полный файл записи
  // utils.downloadBlob(blob, filename?)      — скачать через браузер
  // utils.createObjectURL(blob)              — создать URL для <video src>
  // utils.uploadBlob(blob, endpoint)         — POST на сервер как FormData
  // utils.saveToIndexedDB(blob, key)         — сохранить в IndexedDB
  // utils.getFileExtension(blob.type)        — получить расширение: 'webm' | 'mp4' | 'mkv'
  utils.downloadBlob(blob, `meeting-${Date.now()}.webm`)
})

// onRecordingData(cb): VoidFunction
// вызывается каждый chunkInterval мс — для стриминга или прогресс-бара
recording.onRecordingData((data: { chunk: Blob; totalSize: number; duration: number }) => {
  // data.chunk: Blob       — очередной чанк записи
  // data.totalSize: number — суммарный размер всех чанков в байтах
  // data.duration: number  — текущая длительность записи в мс
  progressBar.value = (data.totalSize / maxFileSizeBytes) * 100
})

// onRecordingLimitReached(cb): VoidFunction
// вызывается когда запись автоматически остановлена из-за превышения лимита
recording.onRecordingLimitReached((data: { type: 'duration' | 'fileSize'; limit: number }) => {
  // data.type: 'duration' | 'fileSize' — какой лимит сработал
  // data.limit: number                 — значение лимита (секунды или MB)
  if (data.type === 'duration') {
    showNotification(`Достигнут лимит времени: ${data.limit} с`)
  } else {
    showNotification(`Достигнут лимит размера: ${data.limit} MB`)
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
  // Создаёт временную ссылку и инициирует скачивание.
  // filename — имя файла (по умолчанию: recording-<timestamp>.<ext>)

  createObjectURL: (blob: Blob) => string
  // Возвращает blob:-URL для использования в <video src>.
  // Освобождать URL через URL.revokeObjectURL() после использования.

  uploadBlob: (blob: Blob, endpoint: string) => Promise<Response>
  // POST-запрос: blob отправляется как FormData['recording'].

  saveToIndexedDB: (blob: Blob, key: string) => Promise<void>
  // Сохраняет в objectStore 'files' базы данных 'recordings'.

  getFileExtension: (mimeType: string) => string
  // 'video/webm...' → 'webm', 'video/mp4...' → 'mp4', 'video/x-matroska...' → 'mkv'
}
```

---

## Типичные сценарии

### Запись звонка с автоскачиванием

```typescript
await recording.startRecording({
  includeVideo: true,
  includeAudio: true,
  quality: 'high',
})

// Индикатор записи
recording.onStateChange((state) => {
  recDot.classList.toggle('active', state.isRecording)
  recTimer.textContent = formatDuration(state.duration)
})

// Остановка по кнопке
stopBtn.onclick = () => recording.stopRecording()

// Скачать готовый файл
recording.onRecordingStopped((blob, utils) => {
  utils.downloadBlob(blob, `meeting-${Date.now()}.webm`)
})
```

### Запись с ограничениями

```typescript
await recording.startRecording({
  maxDuration: 3600,   // 1 час
  maxFileSize: 500,    // 500 MB
})

recording.onRecordingLimitReached(({ type, limit }) => {
  const reason = type === 'duration' ? `${limit} с` : `${limit} MB`
  showNotification(`Запись остановлена: достигнут лимит (${reason})`)
})
```

### Стриминг чанков на сервер

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

### Воспроизведение после записи

```typescript
recording.onRecordingStopped((blob, utils) => {
  const url = utils.createObjectURL(blob)
  videoPlayer.src = url
  videoPlayer.onloadeddata = () => URL.revokeObjectURL(url)
})

await recording.startRecording()
// ... пользователь записывает
await recording.stopRecording()
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `startRecording(opts?)` | `Promise<void>` | Начать запись |
| `stopRecording()` | `Promise<Blob>` | Остановить и получить Blob |
| `pauseRecording()` | `void` | Поставить на паузу |
| `resumeRecording()` | `void` | Возобновить после паузы |
| `state` | `RecordingState` | Текущее состояние (геттер) |
| `onStateChange(cb)` | `VoidFunction` | Подписка на изменение состояния |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
| `onRecordingStopped(cb)` | `VoidFunction` | Вызывается при остановке, передаёт Blob и утилиты |
| `onRecordingData(cb)` | `VoidFunction` | Вызывается каждый `chunkInterval` мс |
| `onRecordingLimitReached(cb)` | `VoidFunction` | Вызывается при достижении лимита (duration или fileSize) |
