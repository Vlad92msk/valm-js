# Event System

`Valm` extends `TypedEventEmitter` — every subscription returns an unsubscribe function:

```typescript
const unsub = media.on('error', (event) => { ... });
unsub(); // unsubscribe
```

Individual controllers use named callbacks (`camera.onStateChange`, `mic.onError`, etc.) — described in the corresponding sections. The module's events are their high-level equivalent: they aggregate information across the whole stream and are handy when you don't need per-controller detail.

---

## Valm events

```typescript
const media = new Valm();

// An error from any source.
// The aggregated counterpart of onError() on individual controllers.
media.on('error', ({ source, error, action }) => {
  // source: MediaErrorSource — where the error came from
  // error: unknown          — the original error
  // action?: string         — the action during which the error occurred
  console.error(`[${source}] ${action ?? ''}`, error);
});

// Video turned off (camera.disable()).
// Counterpart of camera.onStateChange() when state.isEnabled === false, but without a payload.
media.on('videoDisabled', () => {
  showPlaceholder();
});

// Audio turned off (mic.disable()).
// Counterpart of mic.onStateChange() when state.isEnabled === false, but without a payload.
media.on('audioDisabled', () => {
  showMutedIcon();
});

// Media fully reset via resetMedia().
// A unique event — no controller counterpart.
media.on('mediaReset', () => {
  resetUI();
});

// Any change to the video stream state.
// Counterpart of camera.onStateChange(), but returns MediaStreamState (the whole stream)
// instead of CameraState (camera only).
media.on('videoStateChanged', (state) => {
  // state: MediaStreamState
  // {
  //   stream: MediaStream | null,        — active stream
  //   hasVideo: boolean,                 — has a video track
  //   hasAudio: boolean,                 — has an audio track
  //   isVideoEnabled: boolean,           — video enabled
  //   isAudioEnabled: boolean,           — audio enabled
  //   isVideoMuted: boolean,             — video muted
  //   isAudioMuted: boolean,             — audio muted
  //   currentVideoDevice: string | null, — deviceId of the active camera
  //   currentAudioDevice: string | null, — deviceId of the active microphone
  //   volume: number,                    — current volume level [0..100]
  //   videoSettings: MediaTrackSettings | null,
  //   audioSettings: MediaTrackSettings | null,
  //   isSpeaking: boolean                — speech detected
  // }
  updateVideoUI(state);
});

// Any change to the audio stream state.
// Counterpart of mic.onStateChange(), but returns MediaStreamState instead of MicrophoneState.
media.on('audioStateChanged', (state) => {
  // state: MediaStreamState (same structure)
  updateAudioUI(state);
});
```

---

## EffectsController events

```typescript
enum EffectsEvents {
  STATE_CHANGED       = 'stateChanged',
  EFFECT_ENABLED      = 'effectEnabled',
  EFFECT_DISABLED     = 'effectDisabled',
  EFFECT_ADDED        = 'effectAdded',
  EFFECT_REMOVED      = 'effectRemoved',
  PROCESSING_STARTED  = 'processingStarted',
  PROCESSING_STOPPED  = 'processingStopped',
  ERROR               = 'error',
  QUALITY_CHANGED     = 'quality:changed',
  PERFORMANCE_CHANGED = 'performance:changed',
}
```

```typescript
import { EffectsEvents } from 'valm-js/effects';

const effects = media.effectsController;

effects.on(EffectsEvents.EFFECT_ENABLED, ({ effect }) => {
  // effect: string — effect name ('backgroundBlur', 'virtualBackground')
  console.log(`Effect enabled: ${effect}`);
});

effects.on(EffectsEvents.EFFECT_DISABLED, ({ effect }) => {
  console.log(`Effect disabled: ${effect}`);
});

effects.on(EffectsEvents.EFFECT_ADDED, ({ effect }) => {
  // effect registered and enabled
});

effects.on(EffectsEvents.EFFECT_REMOVED, ({ effect }) => {
  // effect disabled and removed
});

effects.on(EffectsEvents.PROCESSING_STARTED, () => {
  // video pipeline started
});

effects.on(EffectsEvents.PROCESSING_STOPPED, () => {
  // video pipeline stopped
});

effects.on(EffectsEvents.QUALITY_CHANGED, ({ preset }) => {
  // preset: QualityPreset — 'low' | 'medium' | 'high'
  console.log('Quality preset:', preset);
});

effects.on(EffectsEvents.PERFORMANCE_CHANGED, (config) => {
  // config: PerformanceConfig — ML pipeline performance settings
});

effects.on(EffectsEvents.ERROR, ({ source, action, error }) => {
  // source: string, action?: string, error: unknown
  console.error('Effects error:', error);
});

effects.on(EffectsEvents.STATE_CHANGED, (state) => {
  // state: EffectsState — full state of the effects controller
});
```

---

## MediaEvents (for plugin authors)

`MediaEvents` is an internal enum of `MediaStreamService`. You only need it directly when writing plugins and working with `context.mediaStreamService`:

```typescript
enum MediaEvents {
  STATE_CHANGED        = 'stateChanged',
  TRACK_ADDED          = 'trackAdded',
  TRACK_REMOVED        = 'trackRemoved',
  TRACK_MUTED          = 'trackMuted',
  TRACK_UNMUTED        = 'trackUnmuted',
  DEVICE_CHANGED       = 'deviceChanged',
  VOLUME_CHANGE        = 'volumeChange',
  TRACK_REPLACED       = 'trackReplaced',
  VIDEO_STATE_CHANGED  = 'videoStateChanged',
  AUDIO_STATE_CHANGED  = 'audioStateChanged',
  VIDEO_DISABLED       = 'videoDisabled',
  AUDIO_DISABLED       = 'audioDisabled',
  MEDIA_RESET          = 'mediaReset',
  AUDIO_OUTPUT_CHANGED = 'audioOutputChanged',
  ERROR                = 'error',
}
```

---

## When to use which

| | `media.on('event', cb)` | `controller.onStateChange(cb)` |
|---|---|---|
| **Data** | `MediaStreamState` — the entire stream | `CameraState` / `MicrophoneState` — this controller only |
| **Errors** | aggregated, with `source` | only from the specific controller |
| **When to use** | a simple reaction to the fact of an event, no detail needed | when you need specific controller state fields |

**Use `media.on()`** when:
- you need to handle errors from any source in one place
- knowing the fact is enough (`videoDisabled`, `mediaReset`) without a payload
- you're building a shared UI layer over the whole module

**Use `controller.onXxx()`** when:
- you need `CameraState.isPreviewing` or `MicrophoneState.isSpeaking` — fields not present in `MediaStreamState`
- you subscribe next to a specific controller (e.g. inside a camera component)
- you need `onTrackReplaced`, `onVolumeChange` — these events aren't available at the module level

---

## Error types

```typescript
interface MediaErrorEvent {
  source: MediaErrorSource;
  action?: string;
  error: unknown;
}

type MediaErrorSource =
  | 'camera'
  | 'microphone'
  | 'camera/microphone'
  | 'screenShare'
  | 'effects'
  | 'recording'
  | 'transcription'
  | 'initialization'
  | 'cleanup'
  | 'media-stream';
```
