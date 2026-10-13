# TranscriptionController

Speech-to-text transcription based on the Web Speech API. Verified in desktop Chrome and Edge; not supported in Firefox.

> **What is recognised.** The browser listens to the **system default microphone** itself, not to the Valm track. The device selected in your app, noise suppression, gain and audio effects do not affect recognition. Only the local user's speech is recognised.
>
> **One session per browser.** Chrome keeps a single recognition session across all tabs. If another tab or site starts one, the current one stops with `stopReason: 'aborted'` and is not restarted.
>
> **Mobile.** Safari (including iOS) and Chrome on Android expose the constructor, so `isSupported` is `true`, but behaviour there has not been verified: a sound may play on every start and recognition may conflict with the call's microphone. Test on your devices before enabling it.

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
    pauseOnMute: true,       // do not listen while the Valm microphone is muted (default: true)
  }
})
```

**`autoStart`** — if `true`, transcription starts automatically when the microphone is enabled (an audio track is added to the stream).

**`pauseOnMute`** — if `true`, recognition is paused (`status: 'paused'`) while the microphone is muted (`microphoneController.toggleMute()`), and nothing said while muted is delivered. It resumes by itself after unmute.

**`interimResults`** — if `true`, interim results that may still change are delivered (`isFinal: false` in `onTranscript`, the `interim` field in `onTranscriptEvent`).

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

`stop()` followed immediately by `start()` is safe: each recognition session is isolated, late events of the old one do not affect the new one.

### Microphone and recognition

`start()` is an intent: `isActive` stays `true` until you call `stop()` or recognition stops on an error. Whether the browser is listening right now is in `status`.

- Microphone muted (with `pauseOnMute: true`) — `status: 'paused'`, recognition returns after unmute.
- Microphone turned off (`disable()`, device lost) — `status: 'paused'`, recognition returns when it is back. Previously it stopped for good.
- `start()` while the Valm microphone is off listens right away: recognition does not need the Valm track. In a call, only call `start()` while the microphone is on.

### Restarts and errors

The browser ends a session by itself after a pause in speech — Valm opens the next one.

| What happened | What Valm does |
|---|---|
| Silence (`no-speech`), normal end of a session | Restart after 100 ms |
| `network` and other non-fatal errors | Restart with a growing delay: 1 s, 2 s, 4 s … up to 30 s. The delay resets after the first result |
| `aborted` | Stop, `stopReason: 'aborted'`: another tab or site took the session |
| `not-allowed`, `service-not-allowed`, `audio-capture`, `language-not-supported`, `bad-grammar` | Stop, `stopReason: 'error'` |

Every stop is reported through `onStateChange` — there is no need to poll `state.isActive` on a timer.

### Language

```typescript
// updateLanguage(language: string): void
transcription.updateLanguage('ru-RU')  // Russian
transcription.updateLanguage('en-US')  // English (US)
transcription.updateLanguage('de-DE')  // German
```

Changing the language during active transcription restarts it automatically. So does `configurationController.updateTranscriptionConfig({ language, interimResults })`.

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
  isActive: boolean        // true — transcription requested (start() without stop() and without a stop on error)
  isSupported: boolean     // true — the browser has the Web Speech API
  currentLanguage: string  // current recognition language (BCP-47, e.g. 'ru-RU')
  status: TranscriptionStatus
  stopReason: 'manual' | 'aborted' | 'error' | null  // why it stopped last time
}

type TranscriptionStatus =
  | 'idle'        // not requested
  | 'starting'    // a session is opening
  | 'listening'   // the browser is listening
  | 'restarting'  // gap between sessions (silence, network error)
  | 'paused'      // requested, but the microphone is muted or off
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
  // transcript.resultIndex: number — phrase number within the session: the same for interim versions and the final one

  if (transcript.isFinal) {
    appendToTranscript(transcript.text)
  } else {
    showInterim(transcript.text + '...')
  }
})
unsub()  // unsubscribe

// onTranscriptEvent(cb): VoidFunction — one recognition event as a whole
// Chrome often delivers several results in one event (a settled part and a "tail",
// a final phrase and the start of the next one). Here they are already joined — easier for subtitles than onTranscript.
transcription.onTranscriptEvent((event: TranscriptEvent) => {
  // event.final: string            — phrases finished in this event ('' if none)
  // event.interim: string          — the whole current unfinished text
  // event.items: TranscriptItem[]  — the same results one by one
  // event.timestamp: number
  if (event.final) appendLine(event.final)
  currentLineEl.textContent = event.interim
})

// onStateChange(cb): VoidFunction
transcription.onStateChange((state: TranscriptionState) => {
  // called on start/stop, on status changes and when recognition stops on an error
  micBtn.classList.toggle('transcribing', state.status === 'listening')
  if (state.stopReason === 'aborted') showHint('Recognition is in use by another tab')
})

// onError(cb): VoidFunction
transcription.onError((error: MediaErrorEvent) => {
  // error.source: string    — always 'transcription'
  // error.action?: string   — 'start' | 'autoStart' | 'session' (error of a running session) | 'restart' (could not open the next one)
  // error.code?: string     — Web Speech API code ('network', 'aborted', …) when the error came from recognition
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

let hideTimer: ReturnType<typeof setTimeout>
const unsub = transcription.onTranscriptEvent(({ final, interim }) => {
  subtitleEl.textContent = interim || final
  clearTimeout(hideTimer)
  if (!interim) hideTimer = setTimeout(() => (subtitleEl.textContent = ''), 5000)
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
| `onTranscript(cb)` | `VoidFunction` | Subscribe to individual results |
| `onTranscriptEvent(cb)` | `VoidFunction` | Subscribe to whole recognition events (`final` + `interim`) |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to state changes |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
