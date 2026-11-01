# Voice Translate

Translates the speaker's voice into another language right in the browser. The user enters **their own** API
key, picks a language and turns translation on themselves; the key stays in their browser and they pay for it.
The translated speech replaces the microphone in the published track — for a call it is an ordinary outgoing
audio track, just like after noise suppression: the server and other participants change nothing and hear the
language the speaker chose.

The first built-in provider is **Gemini Live Translate** (Google). Your own provider plugs in as one transport,
without changing valm (see [“Custom provider”](#custom-provider)).

Try it: the **Translate** tab in the [Playground](/playground).

> **Translation is off by default.** Until `enable()` is called, valm opens no connections, sends no audio and
> does not touch the microphone track. When and how to offer translation is up to the application.

## Setup

The plugin is a separate subpath export: without `use(...)` the translation code is not in your bundle.

```typescript
import { Valm } from 'valm-js'
import { VoiceTranslatePlugin, GeminiLiveTranslateTransport } from 'valm-js/voice-translate'

const media = new Valm().use(new VoiceTranslatePlugin())
const translate = media.voiceTranslateController

// Enable — only on a user action
await translate.enable({
  transport: new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey: userKey } }),
  targetLanguage: 'en',
})

translate.onStateChange((state) => console.log(state.status, state.activity))
translate.onTranscript((t) => t.isFinal && console.log(t.kind, t.turnText))
translate.onError((e) => console.warn(e.reason, e.message))

translate.setTargetLanguage('de')   // reconnects the session
await translate.disable()           // the original voice goes back into the graph
```

What `enable()` does:

- the translator is inserted into the microphone audio graph:
  `source → gain → [noise suppression] → [translation] → analyser → destination → published track`;
- if the graph was not running before (no `setGain`, `onAudioData` or noise suppression), valm replaces the
  published track once — `microphoneController.onTrackReplaced` subscribers get the new track (same as with
  noise suppression); after that, changing the language or disabling translation does **not** replace the track;
- the session opens when there is a microphone. Calling `enable()` with the microphone off is fine: the session
  opens together with it. Microphone turned off — the session closes (you don't pay for silence); turned on —
  it opens again;
- while the session is opening and until a phrase is translated, the output is **silence**, not the original:
  otherwise listeners would hear both;
- while the microphone is muted (`toggleMute`), no audio is sent to the service (`pauseWhenMuted`, default `true`).

## Options

```typescript
await translate.enable({
  transport,                    // provider (required)
  targetLanguage: 'en',         // BCP-47 from transport.info.languages (required)
  sameLanguageSpeech: 'pass',   // speech already in the target language: 'pass' | 'silence'
  originalVolume: 0,            // original under the translation, 0..1
  errorFallback: 'original',    // what plays when the session fails: 'original' | 'silence'
  pauseWhenMuted: true,         // don't send audio while the microphone is muted
  voiceThreshold: 0.01,         // voice threshold for latency measurement (RMS 0..1)
  phraseGapMs: 700,             // pause after which a phrase is over
})
```

| Option | Default | Why |
|---|---|---|
| `targetLanguage` | — | The translation language. The speaker's language is detected automatically — no need to pick it |
| `sameLanguageSpeech` | `'pass'` | The speaker switched to the target language: `'pass'` — the service repeats the speech, listeners hear it; `'silence'` — silence in the call (no original, no translation) |
| `originalVolume` | `0` | “Original quietly underneath” mode, e.g. `0.15` |
| `errorFallback` | `'original'` | The session failed (limit, network) — listeners hear at least the original voice instead of silence |
| `pauseWhenMuted` | `true` | Services bill per second of audio — silence while muted is not sent |

**One session — one target language.** `setTargetLanguage()` and `setSameLanguageSpeech()` close the session and
open a new one (about a second of silence, events `reconnecting` → `sessionOpened`). `setOriginalVolume()` and
`setErrorFallback()` apply on the fly.

The provider declares the language list — `transport.info.languages` (`{ code, name }`). Gemini has 78.

## State

```typescript
interface VoiceTranslateState {
  isEnabled: boolean                 // enable() was called (there may be no session yet — no microphone)
  status: 'idle' | 'connecting' | 'active' | 'error'
  error: VoiceTranslateError | null  // the reason when status === 'error'
  activity: 'silent' | 'listening' | 'translating'  // quiet / speaking, no translation yet / translation playing
  providerId: string | null          // 'gemini-live-translate'
  targetLanguage: string | null
  detectedLanguage: string | null    // the speaker's language detected by the service
  isInputPaused: boolean             // audio is not being sent (mute)
  latency: {
    lastStartToFirstAudioMs: number | null  // phrase start → first translated sound
    lastEndToFirstAudioMs: number | null    // phrase end → translation start (null — it started during the phrase)
    lastEndToFinishMs: number | null        // phrase end → translation finished playing
    avgStartToFirstAudioMs: number | null
    avgEndToFinishMs: number | null
    samples: number
  }
  usage: { inputSeconds: number; outputSeconds: number }  // for cost estimates
}

interface VoiceTranslateError {
  reason: 'invalid-key' | 'quota' | 'network' | 'unsupported' | 'server' | 'unknown'
  message: string           // the service's text as is
  code?: string | number    // WebSocket close code, HTTP status, 'RESOURCE_EXHAUSTED'
  providerId: string
}
```

`translate.state` is the current state; `translate.isEnabled` tells whether translation is on.

## Events

Every event of the service is available to the application: one by one — `translate.on(VoiceTranslateEvents.X, cb)`,
all at once — `translate.onAny(({ type, payload }) => …)`. Shortcuts: `onStateChange`, `onTranscript`, `onError`.
Each subscription returns an unsubscribe function.

```typescript
import { VoiceTranslateEvents } from 'valm-js/voice-translate'

translate.on(VoiceTranslateEvents.LANGUAGE_DETECTED, ({ languageCode }) => showFlag(languageCode))
translate.onAny((event) => devtoolsLog(event.type, event.payload))
```

| Event | Payload | When |
|---|---|---|
| `enabled` | `{ providerId, targetLanguage }` | `enable()` was called |
| `disabled` | — | `disable()` was called |
| `stateChanged` | `VoiceTranslateState` | any state change |
| `statusChanged` | `{ status, previous, error }` | `idle / connecting / active / error` changed |
| `activityChanged` | `{ activity, previous }` | speaking / translation playing / silence |
| `latencyChanged` | `latency` | a new latency measurement |
| `usageChanged` | `{ inputSeconds, outputSeconds }` | once a second while audio flows |
| `transcript` | `VoiceTranscriptEvent` | a piece of original or translated text |
| `languageDetected` | `{ languageCode, previous }` | the service detected (changed) the speaker's language |
| `translatedAudio` | `{ durationMs, rms, peak }` | a piece of translated audio arrived (level 0..1) |
| `interrupted` | — | the service interrupted its answer, the unplayed part was dropped |
| `turnComplete` | `{ inputText, outputText }` | the turn is over — final text |
| `sessionOpened` | `{ providerId, targetLanguage, isReconnect }` | the session accepts audio |
| `sessionClosed` | `{ code?, reason?, willReconnect }` | the connection closed |
| `reconnecting` | `{ reason }` | `'go-away'` (connection limit), `'language-changed'`, `'options-changed'`, `'graph-restarted'` (microphone switched) |
| `inputPaused` | `{ isPaused }` | sending audio paused / resumed (mute) |
| `error` | `VoiceTranslateError` | session error |
| `providerEvent` | `{ providerId, type, data }` | every service message as is — for debugging |

```typescript
interface VoiceTranscriptEvent {
  kind: 'input' | 'output'   // input — the speaker, output — the translation
  text: string               // the new piece
  isInterim: boolean         // draft while the person speaks (the service may correct it)
  turnText: string           // the whole text of the current turn (without drafts)
  isFinal: boolean           // the turn is over: turnText is final, text is empty
  languageCode?: string
  timestamp: number
}
```

`providerEvent` carries the provider's raw messages in full (for Gemini — `setupComplete`, `serverContent` with
audio and transcripts, `goAway`, `usageMetadata`, `close` with its code) — nothing from the service's answer is
lost. They contain no key.

## Getting a Gemini key

A free key takes a minute, no bank card needed:

1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key**. If AI Studio asks for a project, pick an existing one or create a new one
   (a Google Cloud project is created automatically).
3. Copy the key (a string like `AIza…`).
4. Paste it into the app's key field (in the Playground — the Translate tab, “Gemini API key”) and turn
   translation on.

The key stays in the browser: valm keeps it only in memory, never saves or logs it; it is sent only to Google.
Whether and where to keep the key between visits is the application's decision. You can delete or reissue the
key on the same API keys page.

## Limits and cost

- **Free tier** — free, but Google may use the data you send to improve its products. For conversations that
  must not be shared — the paid tier.
- **Paid tier** (prices as of 2026-11-01): ≈ **$0.0053/min** of input audio + **$0.0315/min** of translation —
  about **$0.037 per minute** of speech. `state.usage` counts the seconds for your own estimate.
- Limits are counted **per Google Cloud project**, not per key: several keys of one project share the limit.
- Daily limits reset **at midnight Pacific time**.
- The exact requests per minute / per day (RPM, RPD) for your project are in AI Studio
  ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)). `gemini-3.5-live-translate-preview` is a
  preview model: its limits are stricter than those of stable models.
- One connection lives about 10 minutes; before closing, the service sends `goAway` and valm opens a new one by
  itself (`reconnecting` with `reason: 'go-away'`, a short pause in translation).

## Errors

| `reason` | Meaning | What to do |
|---|---|---|
| `invalid-key` | the key or token was rejected (`API key not valid`, `UNAUTHENTICATED`, `PERMISSION_DENIED`) | check that the key is copied in full and not deleted in AI Studio; create a new one |
| `quota` | `429 RESOURCE_EXHAUSTED` — the per-minute or daily limit | wait a minute and enable again; the daily limit lasts until midnight Pacific time; check the project's limits in AI Studio; for larger volumes — the paid tier |
| `network` | the connection did not open or dropped (code 1006) | internet, VPN, ad blockers and corporate proxies |
| `unsupported` | the browser lacks `AudioWorklet` or `WebSocket` | a current Chrome, Edge or Firefox |
| `server` | the service closed the session with an error | enable again; the text is in `error.message` |

On error, listeners hear the original voice (`errorFallback: 'original'`); for silence on error —
`errorFallback: 'silence'`. A failed session is not reopened automatically: show the user the reason and let
them turn it on again (`disable()` → `enable()`).

## Connection modes

```typescript
import { GeminiLiveTranslateTransport, geminiTokenFromApiKey } from 'valm-js/voice-translate'

// 1. Key directly: the key is in the WebSocket URL. Works from the browser with no server;
//    Google calls this option “for testing” — the key is visible in the page's network tools.
new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey } })

// 2. Ephemeral token from the browser: the browser exchanges the key for a short single-use token
//    (auth_tokens allows browsers via CORS) and opens the session with the token only —
//    the key does not end up in the socket URL or proxy logs. A token is issued for every connection.
new GeminiLiveTranslateTransport({ auth: { type: 'ephemeral-token', getToken: geminiTokenFromApiKey(apiKey) } })

// 3. Ephemeral token from your app's server: no key in the browser at all
new GeminiLiveTranslateTransport({
  auth: { type: 'ephemeral-token', getToken: (setup) => fetch('/api/gemini-token', { method: 'POST', body: JSON.stringify(setup) }).then((r) => r.text()) },
})
```

`getToken(setup)` receives the session settings (model, language) — they are baked into the token so it cannot
open any other session. Issuing a token from a key — `createGeminiEphemeralToken(apiKey, setup)`.

**A recipe for later — a “minter”.** If the application pays rather than the user, the key lives in the secrets
of a small server (e.g. a Cloudflare Worker without logs or storage) that hands tokens to its users via
`createGeminiEphemeralToken`; audio still goes from the browser straight to Google. valm ships no such server —
it is option 3 on your side.

## Custom provider

A provider is a “PCM16 in → PCM16 out” transport. The audio graph, resampling, silence until ready, latency
measurement, transcripts, state and events are shared (`VoiceTranslator`); the transport only handles the
network and the service's protocol.

```typescript
import type { IVoiceTranslationTransport, VoiceTranslationTransportEvents, VoiceTranslateSessionOptions } from 'valm-js/voice-translate'

class MyTransport implements IVoiceTranslationTransport {
  readonly info = {
    id: 'my-service',
    label: 'My Service',
    format: { inputSampleRate: 24000, outputSampleRate: 24000, chunkMs: 100 },  // valm resamples by itself
    languages: [{ code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }],
    authModes: ['ephemeral-token'] as const,
    capabilities: { sourceAutoDetect: true, sameLanguagePass: false, voiceSelection: false },
    links: { apiKey: 'https://example.com/keys' },
  }

  connect(options: VoiceTranslateSessionOptions, events: VoiceTranslationTransportEvents): void {
    // open the connection; options.targetLanguage, options.sameLanguageSpeech
    // events.onOpen() → events.onReady()             — session ready
    // events.onAudio(pcm16)                           — a piece of translation (info.format.outputSampleRate)
    // events.onTranscript({ kind, text, isInterim })  — texts
    // events.onInterrupted() / onTurnComplete()
    // events.onError({ reason: 'quota', message, code })
    // events.onClose({ code, reason, willReconnect }) / onReconnecting('go-away')
    // events.onRawEvent(type, data)                   — every service message
  }
  sendAudio(pcm: Int16Array): void { /* PCM16 mono, inputSampleRate, chunkMs per chunk */ }
  endAudioStream(): void { /* optional: the microphone is muted */ }
  close(): void { /* close the connection; no events after close */ }
}

await translate.enable({ transport: new MyTransport(), targetLanguage: 'es' })
```

Transport rules: don't start sending before `onReady()`; report errors via `onError` with one of the reasons
(`invalid-key`, `quota`, `network`, `server`), with the service's original text and code in `message` and
`code`; never pass keys to `onRawEvent` or the console.

Translation is the handler of the core audio graph's `'voice-translation'` slot (`IAudioProcessorProvider`); you
can also set a `VoiceTranslator` manually via `mediaStreamService.getAudioProcessingPipeline().setProcessor(...)`,
but the controller is usually enough.

## Gemini Live Translate: protocol details

| | |
|---|---|
| Model | `gemini-3.5-live-translate-preview` (preview) — speech-to-speech translation only |
| Connection | WebSocket `…GenerativeService.BidiGenerateContent?key=…` or `…BidiGenerateContentConstrained?access_token=…` |
| Input | PCM16 LE, 16 kHz, mono, 100 ms chunks (`audio/pcm;rate=16000`); no text input |
| Output | PCM16 LE, 24 kHz, mono |
| Languages | 78 targets (`GEMINI_TRANSLATE_LANGUAGES`); the source is detected automatically |
| Speech in the target language | `translationConfig.echoTargetLanguage` (`sameLanguageSpeech: 'pass'` → `true`) |
| Voice | cannot be chosen, may drift |

The first message after the socket opens:

```json
{
  "setup": {
    "model": "models/gemini-3.5-live-translate-preview",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "translationConfig": { "targetLanguageCode": "en", "echoTargetLanguage": true }
    },
    "inputAudioTranscription": {},
    "outputAudioTranscription": {}
  }
}
```

`inputAudioTranscription` / `outputAudioTranscription` are fields of `setup` itself, not of `generationConfig`:
the example on the Live translate page puts them into `generationConfig`, and the raw WebSocket answers
`Unknown name "inputAudioTranscription" at 'setup.generation_config'`. The REST body of `auth_tokens` is
`{ uses, expireTime, newSessionExpireTime, bidiGenerateContentSetup }`; the `liveConnectConstraints` field from
the documentation examples is the SDK form and REST rejects it.

## Limitations

- **The voice cannot be chosen** — Gemini speaks in a neutral voice that may change between phrases.
- **Headphones are required**: translation from speakers gets back into the microphone.
- **Latency**: translation runs during the phrase but lags behind speech — `state.latency` shows the numbers.
- **Browsers**: Chrome and Firefox — the audio graph and protocol are checked; **Safari has not been tested**.
- A failed session is not reopened automatically — that is the user's decision.
- Translation happens on the speaker's side: all listeners hear the one language the speaker chose.
