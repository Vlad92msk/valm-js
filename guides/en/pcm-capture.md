# PCM Capture

An audio-graph node that turns **any** audio input into a stream of mono PCM16 at the rate you need, in fixed-length
chunks, with the loudness (RMS) of each chunk. It plays nothing and sends nothing — your app receives the chunks.

This is the format almost every streaming speech-to-text and voice-model service expects (16 kHz or 24 kHz,
16-bit, mono, 100–250 ms pieces). What happens to the chunks next — a WebSocket, a recording, VAD — is up to the
app; `PcmCapture` is not tied to any service.

The input is anything that connects to an `AudioNode`: your microphone, a remote participant's WebRTC track, an
`<audio>` element, an oscillator.

## Setup

A separate subpath export: nothing gets into your bundle without the import. No plugin and no `Valm` needed.

```typescript
import { PcmCapture, pcm16ToBase64 } from 'valm-js/pcm-capture'

const ctx = new AudioContext()
const source = ctx.createMediaStreamSource(new MediaStream([remoteTrack]))

const capture = await PcmCapture.create(ctx, { sampleRate: 16000, chunkMs: 100 })
source.connect(capture.node)

const off = capture.onChunk(({ pcm, rms }) => {
  // pcm: Int16Array, 1600 samples; rms: 0..1
  socket.send(JSON.stringify({ audio: pcm16ToBase64(pcm) }))
})

capture.setPaused(true)   // participant muted — the stream stops
capture.setPaused(false)

off()                     // unsubscribe
capture.dispose()         // disconnect the node and stop the worklet
```

## API

```typescript
interface PcmCaptureOptions {
  sampleRate?: number   // output rate, Hz (default 16000)
  chunkMs?: number      // chunk length, ms (default 100)
  paused?: boolean      // start paused (default false)
}

interface PcmCaptureChunk {
  pcm: Int16Array       // mono, sampleRate × chunkMs / 1000 samples
  rms: number           // mean loudness of the chunk, 0..1
}

class PcmCapture {
  static create(ctx: BaseAudioContext, options?: PcmCaptureOptions): Promise<PcmCapture>
  readonly node: AudioWorkletNode   // input only; no outputs
  readonly sampleRate: number
  readonly chunkMs: number
  readonly isPaused: boolean
  readonly isDisposed: boolean
  onChunk(cb: (chunk: PcmCaptureChunk) => void): () => void
  setPaused(paused: boolean): void
  dispose(): void
}

// base64 ⇄ PCM16 little-endian — for JSON protocols
pcm16ToBase64(pcm: Int16Array): string
base64ToPcm16(base64: string): Int16Array
```

| What | Behaviour |
|---|---|
| `create()` | Loads the worklet from a Blob URL once per context (parallel calls included). No file in `public/`; a strict CSP needs `script-src blob:`. Throws `RangeError` for non-positive `sampleRate`/`chunkMs` and `Error` when the browser has no AudioWorklet |
| `node` | Input only, **no outputs**: don't connect it to `destination` (you can't) — the browser processes it on its own and nothing is heard. Stereo and more channels are mixed down to mono |
| Silent input | The stream keeps going: zero chunks with `rms: 0`. Services detect the end of a phrase by the pause, so the stream must not stop. To avoid paying for silence, pause |
| `setPaused(true)` | No chunks, the worklet buffers nothing: the partial chunk is dropped. Chunks the worklet sent before the pause but not yet delivered are dropped too |
| `setPaused(false)` | The first chunk is full and made entirely of audio after the pause ended |
| `dispose()` | Removes all listeners, disconnects the node, stops the worklet. Calling it again does nothing. It doesn't close the context — the context is yours |

## Resampling

A low-pass filter (cutoff ≈ 0.45 of the output rate) and linear interpolation from the context rate to
`sampleRate`. Good enough for speech; the capture is the same as in [voice translation](./voice-translate.md) — one
source for both.

## Context

- An `AudioContext` created before a user gesture may be `suspended` — then no chunks arrive. Call
  `ctx.resume()` on a click.
- Several nodes on one context are fine, with different options (e.g. one per participant).
- Remote WebRTC tracks in Chrome: for `MediaStreamAudioSourceNode` to get audio, the track usually has to be
  played by a media element. Most reliable is the same `<audio>` that already plays it; a spare element should
  have `volume = 0`, not `muted`: for a muted element Chrome may not start the output, and the graph gets silence.
  That's Chrome, not the node.
