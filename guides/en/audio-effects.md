# AudioEffectsPlugin

ML-based processing of microphone audio (noise suppression, etc.) as a pluggable
plugin — modeled on [`EffectsPlugin`](./effects.md) for video. The core handles the
lightweight part (gain + visualization, see [microphone.md](./microphone.md)); heavy ML
providers are attached only through this plugin, so their dependencies never leak into
the core.

Imported via a separate subpath export — nothing is loaded without `use(...)`.

## Setup

```typescript
import { Valm } from 'valm-js';
import { AudioEffectsPlugin, RNNoiseProvider } from 'valm-js/audio-effects';

const media = new Valm();

media.use(new AudioEffectsPlugin({
  providers: {
    noiseSuppression: new RNNoiseProvider({ workletUrl: '/worklets/rnnoise.js' }),
  },
}));
```

The plugin inserts the provider node into the microphone audio graph:

```
source → gain → [ML node] → analyser → destination
```

When attached with a provider, the graph activates: the published audio track
is replaced with the processed one (subscribers of `mic.onTrackReplaced` receive the
new track). The core's `gain` and visualization keep working on top of the ML processing.

---

## Providers

A provider is an object that creates an `AudioNode` in the graph's supplied `AudioContext`:

```typescript
interface IAudioNoiseSuppressionProvider {
  createNode(context: AudioContext): Promise<AudioNode> | AudioNode
  destroy?(): void
}
```

### RNNoiseProvider

Noise suppression based on RNNoise. Expects a ready-made AudioWorklet module (the DSP/wasm
itself is not bundled, to avoid pulling in a heavy dependency):

```typescript
new RNNoiseProvider({
  workletUrl: '/worklets/rnnoise.js',  // required
  processorName: 'rnnoise-processor',  // defaults to 'rnnoise-processor'
})
```

### AudioWorkletProvider

Base provider: loads an arbitrary AudioWorklet module and creates a node.
Convenient for building your own ML providers on top of it:

```typescript
import { AudioWorkletProvider } from 'valm-js/audio-effects';

new AudioWorkletProvider({
  workletUrl: '/worklets/my-denoiser.js',
  processorName: 'my-denoiser',
  processorOptions: { intensity: 0.8 },
})
```

### Custom provider

```typescript
import { IAudioNoiseSuppressionProvider } from 'valm-js/audio-effects';

class MyProvider implements IAudioNoiseSuppressionProvider {
  createNode(context: AudioContext): AudioNode {
    const node = context.createGain(); // ← your processing node
    return node;
  }
  destroy() { /* release resources */ }
}

media.use(new AudioEffectsPlugin({ providers: { noiseSuppression: new MyProvider() } }));
```

---

## API

| Export | Description |
|--------|-------------|
| `AudioEffectsPlugin` | ML audio-processing plugin (`media.use(...)`) |
| `RNNoiseProvider` | RNNoise provider on top of AudioWorklet |
| `AudioWorkletProvider` | Base AudioWorklet provider |
| `IAudioNoiseSuppressionProvider` | Provider interface for your own implementations |

### AudioEffectsPluginOptions

```typescript
interface AudioEffectsPluginOptions {
  providers?: {
    noiseSuppression?: IAudioNoiseSuppressionProvider
  }
}
```
