# TranscriptionController

Транскрипция речи в текст на основе Web Speech API. Проверено в Chrome и Edge на компьютере; в Firefox не поддерживается.

> **Что распознаётся.** Браузер сам слушает **системный микрофон по умолчанию**, а не трек Valm. Выбранное в приложении устройство, шумоподавление, gain и аудиоэффекты на распознавание не влияют. Распознаётся только речь локального пользователя.
>
> **Одна сессия на браузер.** Chrome держит одну сессию распознавания на все вкладки. Если её запустила другая вкладка или сайт, текущая останавливается с `stopReason: 'aborted'` и сама не перезапускается.
>
> **Мобильные.** В Safari (включая iOS) и Chrome на Android конструктор есть и `isSupported` равен `true`, но поведение там не проверялось: возможен звуковой сигнал при каждом старте и конфликт с микрофоном звонка. Проверьте на своих устройствах, прежде чем включать.

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
    pauseOnMute: true,       // не слушать, пока микрофон Valm в mute (по умолчанию: true)
  }
})
```

**`autoStart`** — если `true`, транскрипция запускается автоматически, когда микрофон включён (аудиодорожка добавлена в стрим).

**`pauseOnMute`** — если `true`, на время mute микрофона (`microphoneController.toggleMute()`) распознавание ставится на паузу (`status: 'paused'`), а сказанное в mute никуда не уходит. После unmute оно возобновляется само.

**`interimResults`** — если `true`, приходят промежуточные результаты, которые ещё могут измениться (`isFinal: false` в `onTranscript`, поле `interim` в `onTranscriptEvent`).

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

`stop()` и сразу `start()` безопасны: каждая сессия распознавания изолирована, запоздавшие события старой не влияют на новую.

### Микрофон и распознавание

`start()` — это намерение: `isActive` остаётся `true`, пока вы не вызвали `stop()` или не случилась остановка по ошибке. Слушает ли браузер прямо сейчас, показывает `status`.

- Микрофон в mute (при `pauseOnMute: true`) — `status: 'paused'`, после unmute распознавание возвращается.
- Микрофон выключили (`disable()`, потеря устройства) — `status: 'paused'`, после включения распознавание возвращается. Раньше оно останавливалось насовсем.
- `start()` при выключенном микрофоне Valm слушает сразу: трек Valm распознаванию не нужен. В звонке вызывайте `start()` только при включённом микрофоне.

### Перезапуски и ошибки

Браузер сам завершает сессию после паузы в речи — Valm открывает следующую.

| Что случилось | Что делает Valm |
|---|---|
| Тишина (`no-speech`), штатное завершение сессии | Перезапуск через 100 мс |
| `network` и другие нефатальные ошибки | Перезапуск с растущей паузой: 1 с, 2 с, 4 с … до 30 с. Пауза сбрасывается после первого результата |
| `aborted` | Остановка, `stopReason: 'aborted'`: сессию забрала другая вкладка или сайт |
| `not-allowed`, `service-not-allowed`, `audio-capture`, `language-not-supported`, `bad-grammar` | Остановка, `stopReason: 'error'` |

О любой остановке сообщает `onStateChange` — опрашивать `state.isActive` по таймеру не нужно.

### Язык

```typescript
// updateLanguage(language: string): void
transcription.updateLanguage('ru-RU')  // Русский
transcription.updateLanguage('en-US')  // English (US)
transcription.updateLanguage('de-DE')  // Deutsch
```

При смене языка во время активной транскрипции она автоматически перезапускается. То же делает `configurationController.updateTranscriptionConfig({ language, interimResults })`.

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
  isActive: boolean        // true — транскрипция запрошена (start() без stop() и без остановки по ошибке)
  isSupported: boolean     // true — в браузере есть Web Speech API
  currentLanguage: string  // текущий язык распознавания (BCP-47, напр. 'ru-RU')
  status: TranscriptionStatus
  stopReason: 'manual' | 'aborted' | 'error' | null  // почему остановилась в последний раз
}

type TranscriptionStatus =
  | 'idle'        // не запрошена
  | 'starting'    // сессия открывается
  | 'listening'   // браузер слушает
  | 'restarting'  // пауза между сессиями (тишина, ошибка сети)
  | 'paused'      // запрошена, но микрофон в mute или выключен
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
  // transcript.resultIndex: number — номер фразы в сессии: одинаковый у промежуточных версий и финала

  if (transcript.isFinal) {
    appendToTranscript(transcript.text)
  } else {
    showInterim(transcript.text + '...')
  }
})
unsub()  // отписка

// onTranscriptEvent(cb): VoidFunction — одно событие распознавания целиком
// Chrome часто присылает в одном событии несколько результатов (устоявшуюся часть и «хвост»,
// финал и начало следующей фразы). Здесь они уже склеены — для субтитров удобнее, чем onTranscript.
transcription.onTranscriptEvent((event: TranscriptEvent) => {
  // event.final: string            — фразы, законченные в этом событии ('' если таких нет)
  // event.interim: string          — весь текущий незаконченный текст
  // event.items: TranscriptItem[]  — те же результаты по отдельности
  // event.timestamp: number
  if (event.final) appendLine(event.final)
  currentLineEl.textContent = event.interim
})

// onStateChange(cb): VoidFunction
transcription.onStateChange((state: TranscriptionState) => {
  // вызывается при start/stop, смене status и остановке по ошибке
  micBtn.classList.toggle('transcribing', state.status === 'listening')
  if (state.stopReason === 'aborted') showHint('Распознавание занято другой вкладкой')
})

// onError(cb): VoidFunction
transcription.onError((error: MediaErrorEvent) => {
  // error.source: string    — всегда 'transcription'
  // error.action?: string   — 'start' | 'autoStart' | 'session' (ошибка идущей сессии) | 'restart' (не удалось открыть следующую)
  // error.code?: string     — код Web Speech API ('network', 'aborted', …), если ошибка пришла от распознавания
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

let hideTimer: ReturnType<typeof setTimeout>
const unsub = transcription.onTranscriptEvent(({ final, interim }) => {
  subtitleEl.textContent = interim || final
  clearTimeout(hideTimer)
  if (!interim) hideTimer = setTimeout(() => (subtitleEl.textContent = ''), 5000)
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
| `onTranscript(cb)` | `VoidFunction` | Подписка на отдельные результаты |
| `onTranscriptEvent(cb)` | `VoidFunction` | Подписка на события распознавания целиком (`final` + `interim`) |
| `onStateChange(cb)` | `VoidFunction` | Подписка на изменение состояния |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
