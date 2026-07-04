# TranscriptionController

Транскрипция речи в текст на основе Web Speech API. Поддерживается в Chrome и Edge; в Safari и Firefox не поддерживается.

## Доступ

```typescript
import { Valm } from 'valm-js'

const media = new Valm(config)
await media.initializeMedia()

const transcription = media.transcriptionController
```

---

## Конфигурация

Транскрипция конфигурируется при создании модуля:

```typescript
const media = new Valm({
  transcription: {
    enabled: true,           // включить транскрипцию (по умолчанию: false)
    autoStart: false,        // автостарт при появлении аудиодорожки (по умолчанию: false)
    language: 'ru-RU',       // язык распознавания BCP-47 (по умолчанию: 'ru-RU')
    interimResults: true,    // получать промежуточные результаты (по умолчанию: true)
    saveTranscripts: false,  // сохранять историю в памяти (по умолчанию: false)
  }
})
```

**`autoStart`** — если `true`, транскрипция запускается автоматически когда микрофон включён (аудиодорожка добавлена в стрим), и останавливается когда он отключён.

**`interimResults`** — если `true`, колбэк `onTranscript` вызывается с `isFinal: false` для промежуточных результатов, которые ещё могут измениться.

**`saveTranscripts`** — если `true`, все полученные `TranscriptItem` накапливаются в памяти и доступны через `getTranscripts()`.

---

## Действия

### Запуск и остановка

```typescript
// start(): Promise<void>
await transcription.start()   // запустить транскрипцию

// stop(): void
transcription.stop()          // остановить

// toggle(): Promise<void>
await transcription.toggle()  // если активна — остановить, иначе — запустить
```

### Язык

```typescript
// updateLanguage(language: string): void
transcription.updateLanguage('ru-RU')  // Русский
transcription.updateLanguage('en-US')  // English (US)
transcription.updateLanguage('de-DE')  // Deutsch
```

При смене языка во время активной транскрипции она автоматически перезапускается.

#### Поддерживаемые языки

| Код | Язык |
|-----|------|
| `ru-RU` | Русский |
| `en-US` | English (US) |
| `en-GB` | English (UK) |
| `de-DE` | Deutsch |
| `fr-FR` | Français |
| `es-ES` | Español |
| `it-IT` | Italiano |
| `ja-JP` | 日本語 |
| `ko-KR` | 한국어 |
| `zh-CN` | 中文 (简体) |
| `zh-TW` | 中文 (繁體) |

### История транскриптов

```typescript
// getTranscripts(): TranscriptItem[]
const history = transcription.getTranscripts()
// возвращает копию массива — изменения не влияют на внутренние данные

// clearTranscripts(): void
transcription.clearTranscripts()  // очистить историю из памяти
```

> История накапливается только если `saveTranscripts: true` в конфиге.

---

## Геттеры и состояние

```typescript
transcription.state  // TranscriptionState — текущее состояние (геттер)
```

### `TranscriptionState`

```typescript
interface TranscriptionState {
  isActive: boolean        // true — транскрипция запущена
  isSupported: boolean     // true — браузер поддерживает Web Speech API (Chrome/Edge)
  currentLanguage: string  // текущий язык распознавания (BCP-47, напр. 'ru-RU')
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
// onTranscript(cb): VoidFunction
const unsub = transcription.onTranscript((transcript: TranscriptItem) => {
  // transcript.text: string       — распознанный фрагмент речи
  // transcript.isFinal: boolean   — true = финальный результат, false = промежуточный (может измениться)
  // transcript.confidence: number — уверенность от 0 (низкая) до 1 (высокая)
  // transcript.timestamp: number  — Date.now() в момент получения результата

  if (transcript.isFinal) {
    appendToTranscript(transcript.text)
  } else {
    showInterim(transcript.text + '...')
  }
})
unsub()  // отписка

// onStateChange(cb): VoidFunction
transcription.onStateChange((state: TranscriptionState) => {
  // state.isActive: boolean        — транскрипция запущена
  // state.isSupported: boolean     — браузер поддерживает Web Speech API
  // state.currentLanguage: string  — текущий язык (BCP-47)
  micBtn.classList.toggle('transcribing', state.isActive)
})

// onError(cb): VoidFunction
transcription.onError((error: MediaErrorEvent) => {
  // error.source: string    — всегда 'transcription'
  // error.action?: string   — 'start' | 'autoStart' | 'configUpdate'
  // error.error: unknown    — оригинальная ошибка (SpeechRecognitionErrorEvent или Error)
  console.error('Transcription error:', error)
})
```

### Типы ошибок Web Speech API

| Код | Причина |
|-----|---------|
| `no-speech` | Речь не обнаружена в аудиопотоке |
| `audio-capture` | Нет доступа к микрофону |
| `not-allowed` | Пользователь отклонил разрешение на микрофон |
| `service-not-allowed` | Сервис распознавания недоступен |
| `network` | Сетевая ошибка при обращении к сервису |
| `language-not-supported` | Указанный язык не поддерживается |
| `bad-grammar` | Ошибка грамматики |
| `aborted` | Распознавание прервано |

---

## Типичные сценарии

### Субтитры в реальном времени

```typescript
await transcription.start()

const unsub = transcription.onTranscript(({ text, isFinal }) => {
  if (isFinal) {
    subtitleEl.textContent = text
    setTimeout(() => (subtitleEl.textContent = ''), 5000)
  } else {
    subtitleEl.textContent = text + '...'  // промежуточный результат
  }
})

// По завершении
transcription.stop()
unsub()
```

### Протокол встречи

```typescript
const media = new Valm({
  transcription: {
    enabled: true,
    language: 'ru-RU',
    saveTranscripts: true,  // сохранять для экспорта
  },
})
await media.initializeMedia()

const transcription = media.transcriptionController
await transcription.start()

exportBtn.onclick = () => {
  const items = transcription.getTranscripts()
  const protocol = items
    .filter((t) => t.isFinal)
    .map((t) => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.text}`)
    .join('\n')
  downloadText(protocol, 'meeting-protocol.txt')
}

stopBtn.onclick = () => transcription.stop()
```

### Автостарт с микрофоном

```typescript
const media = new Valm({
  transcription: {
    enabled: true,
    autoStart: true,        // стартует автоматически при включении микрофона
    interimResults: false,  // только финальные результаты
  },
})
await media.initializeMedia()

media.transcriptionController.onTranscript(({ text, isFinal }) => {
  if (isFinal) appendMessage(text)
})
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `start()` | `Promise<void>` | Запустить транскрипцию |
| `stop()` | `void` | Остановить транскрипцию |
| `toggle()` | `Promise<void>` | Запустить если не активна, остановить если активна |
| `updateLanguage(lang)` | `void` | Сменить язык распознавания |
| `getTranscripts()` | `TranscriptItem[]` | Получить копию истории транскриптов |
| `clearTranscripts()` | `void` | Очистить историю из памяти |
| `state` | `TranscriptionState` | Текущее состояние (геттер) |
| `onTranscript(cb)` | `VoidFunction` | Подписка на новые фрагменты речи |
| `onStateChange(cb)` | `VoidFunction` | Подписка на изменение состояния |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
