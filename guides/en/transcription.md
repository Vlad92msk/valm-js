# TranscriptionController

Speech-to-text transcription based on the Web Speech API. Supported in Chrome and Edge; not supported in Safari and Firefox.

## Access

```typescript
import { Valm } from 'valm-js'

const media = new Valm(config)
await media.initializeMedia()

const transcription = media.transcriptionController
```

---

## Configuration

Transcription is configured when the module is created:

```typescript
const media = new Valm({
  transcription: {
    enabled: true,           // enable transcription (default: false)
    autoStart: false,        // auto-start when an audio track appears (default: false)
    language: 'ru-RU',       // recognition language, BCP-47 (default: 'ru-RU')
    interimResults: true,    // receive interim results (default: true)
    saveTranscripts: false,  // keep history in memory (default: false)
  }
})
```

**`autoStart`** — if `true`, transcription starts automatically when the microphone is enabled (an audio track is added to the stream), and stops when it's disabled.

**`interimResults`** — if `true`, the `onTranscript` callback is invoked with `isFinal: false` for interim results that may still change.

**`saveTranscripts`** — if `true`, all received `TranscriptItem`s accumulate in memory and are available via `getTranscripts()`.

---

## Actions

### Start and stop

```typescript
// start(): Promise<void>
await transcription.start()   // start transcription

// stop(): void
transcription.stop()          // stop

// toggle(): Promise<void>
await transcription.toggle()  // if active — stop, otherwise — start
```

### Language

```typescript
// updateLanguage(language: string): void
transcription.updateLanguage('ru-RU')  // Russian
transcription.updateLanguage('en-US')  // English (US)
transcription.updateLanguage('de-DE')  // German
```

Changing the language during active transcription restarts it automatically.

#### Supported languages

| Code | Language |
|------|----------|
| `ru-RU` | Russian |
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

### Transcript history

```typescript
// getTranscripts(): TranscriptItem[]
const history = transcription.getTranscripts()
// returns a copy of the array — changes don't affect internal data

// clearTranscripts(): void
transcription.clearTranscripts()  // clear history from memory
```

> History accumulates only if `saveTranscripts: true` in the config.

---

## Getters and state

```typescript
transcription.state  // TranscriptionState — current state (getter)
```

### `TranscriptionState`

```typescript
interface TranscriptionState {
  isActive: boolean        // true — transcription running
  isSupported: boolean     // true — the browser supports the Web Speech API (Chrome/Edge)
  currentLanguage: string  // current recognition language (BCP-47, e.g. 'ru-RU')
}
```

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
// onTranscript(cb): VoidFunction
const unsub = transcription.onTranscript((transcript: TranscriptItem) => {
  // transcript.text: string       — the recognized speech fragment
  // transcript.isFinal: boolean   — true = final result, false = interim (may change)
  // transcript.confidence: number — confidence from 0 (low) to 1 (high)
  // transcript.timestamp: number  — Date.now() at the moment the result was received

  if (transcript.isFinal) {
    appendToTranscript(transcript.text)
  } else {
    showInterim(transcript.text + '...')
  }
})
unsub()  // unsubscribe

// onStateChange(cb): VoidFunction
transcription.onStateChange((state: TranscriptionState) => {
  // state.isActive: boolean        — transcription running
  // state.isSupported: boolean     — the browser supports the Web Speech API
  // state.currentLanguage: string  — current language (BCP-47)
  micBtn.classList.toggle('transcribing', state.isActive)
})

// onError(cb): VoidFunction
transcription.onError((error: MediaErrorEvent) => {
  // error.source: string    — always 'transcription'
  // error.action?: string   — 'start' | 'autoStart' | 'configUpdate'
  // error.error: unknown    — the original error (SpeechRecognitionErrorEvent or Error)
  console.error('Transcription error:', error)
})
```

### Web Speech API error types

| Code | Cause |
|------|-------|
| `no-speech` | No speech detected in the audio stream |
| `audio-capture` | No access to the microphone |
| `not-allowed` | The user declined microphone permission |
| `service-not-allowed` | The recognition service is unavailable |
| `network` | Network error while contacting the service |
| `language-not-supported` | The specified language is not supported |
| `bad-grammar` | Grammar error |
| `aborted` | Recognition was aborted |

---

## Common scenarios

### Real-time subtitles

```typescript
await transcription.start()

const unsub = transcription.onTranscript(({ text, isFinal }) => {
  if (isFinal) {
    subtitleEl.textContent = text
    setTimeout(() => (subtitleEl.textContent = ''), 5000)
  } else {
    subtitleEl.textContent = text + '...'  // interim result
  }
})

// When done
transcription.stop()
unsub()
```

### Meeting minutes

```typescript
const media = new Valm({
  transcription: {
    enabled: true,
    language: 'ru-RU',
    saveTranscripts: true,  // save for export
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

### Auto-start with the microphone

```typescript
const media = new Valm({
  transcription: {
    enabled: true,
    autoStart: true,        // starts automatically when the microphone is enabled
    interimResults: false,  // final results only
  },
})
await media.initializeMedia()

media.transcriptionController.onTranscript(({ text, isFinal }) => {
  if (isFinal) appendMessage(text)
})
```

---

## API

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `start()` | `Promise<void>` | Start transcription |
| `stop()` | `void` | Stop transcription |
| `toggle()` | `Promise<void>` | Start if inactive, stop if active |
| `updateLanguage(lang)` | `void` | Change the recognition language |
| `getTranscripts()` | `TranscriptItem[]` | Get a copy of the transcript history |
| `clearTranscripts()` | `void` | Clear history from memory |
| `state` | `TranscriptionState` | Current state (getter) |
| `onTranscript(cb)` | `VoidFunction` | Subscribe to new speech fragments |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to state changes |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
