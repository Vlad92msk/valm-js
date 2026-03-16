# Event System

`Valm` наследует `TypedEventEmitter` — все подписки возвращают функцию отписки:

```typescript
const unsub = media.on('error', (event) => { ... });
unsub(); // отписка
```

Отдельные контроллеры используют named callbacks (`camera.onStateChange`, `mic.onError` и т.д.) — они описаны в соответствующих разделах. События модуля — это их высокоуровневый эквивалент: агрегируют информацию со всего стрима и удобны когда не нужна детализация по конкретному контроллеру.

---

## События Valm

```typescript
const media = new Valm();

// Ошибка из любого источника.
// Аналог onError() на отдельных контроллерах, но агрегированный.
media.on('error', ({ source, error, action }) => {
  // source: MediaErrorSource — откуда пришла ошибка
  // error: unknown          — оригинальная ошибка
  // action?: string         — действие, при котором произошла ошибка
  console.error(`[${source}] ${action ?? ''}`, error);
});

// Видео выключено (camera.disable()).
// Аналог camera.onStateChange() когда state.isEnabled === false, но без payload.
media.on('videoDisabled', () => {
  showPlaceholder();
});

// Аудио выключено (mic.disable()).
// Аналог mic.onStateChange() когда state.isEnabled === false, но без payload.
media.on('audioDisabled', () => {
  showMutedIcon();
});

// Медиа полностью сброшено через resetMedia().
// Уникальное событие — нет аналога в контроллерах.
media.on('mediaReset', () => {
  resetUI();
});

// Любое изменение состояния видео-потока.
// Аналог camera.onStateChange(), но возвращает MediaStreamState (весь стрим)
// вместо CameraState (только камера).
media.on('videoStateChanged', (state) => {
  // state: MediaStreamState
  // {
  //   stream: MediaStream | null,        — активный поток
  //   hasVideo: boolean,                 — есть видео-трек
  //   hasAudio: boolean,                 — есть аудио-трек
  //   isVideoEnabled: boolean,           — видео включено
  //   isAudioEnabled: boolean,           — аудио включено
  //   isVideoMuted: boolean,             — видео заглушено
  //   isAudioMuted: boolean,             — аудио заглушено
  //   currentVideoDevice: string | null, — deviceId активной камеры
  //   currentAudioDevice: string | null, — deviceId активного микрофона
  //   volume: number,                    — текущий уровень громкости [0..1]
  //   videoSettings: MediaTrackSettings | null,
  //   audioSettings: MediaTrackSettings | null,
  //   isSpeaking: boolean                — обнаружена речь
  // }
  updateVideoUI(state);
});

// Любое изменение состояния аудио-потока.
// Аналог mic.onStateChange(), но возвращает MediaStreamState вместо MicrophoneState.
media.on('audioStateChanged', (state) => {
  // state: MediaStreamState (та же структура)
  updateAudioUI(state);
});
```

---

## События EffectsController

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
  // effect: string — имя эффекта ('backgroundBlur', 'virtualBackground')
  console.log(`Effect enabled: ${effect}`);
});

effects.on(EffectsEvents.EFFECT_DISABLED, ({ effect }) => {
  console.log(`Effect disabled: ${effect}`);
});

effects.on(EffectsEvents.EFFECT_ADDED, ({ effect }) => {
  // эффект зарегистрирован и включён
});

effects.on(EffectsEvents.EFFECT_REMOVED, ({ effect }) => {
  // эффект отключён и удалён
});

effects.on(EffectsEvents.PROCESSING_STARTED, () => {
  // видео-конвейер запущен
});

effects.on(EffectsEvents.PROCESSING_STOPPED, () => {
  // видео-конвейер остановлен
});

effects.on(EffectsEvents.QUALITY_CHANGED, ({ preset }) => {
  // preset: QualityPreset — 'low' | 'medium' | 'high'
  console.log('Quality preset:', preset);
});

effects.on(EffectsEvents.PERFORMANCE_CHANGED, (config) => {
  // config: PerformanceConfig — настройки производительности ML-конвейера
});

effects.on(EffectsEvents.ERROR, ({ source, action, error }) => {
  // source: string, action?: string, error: unknown
  console.error('Effects error:', error);
});

effects.on(EffectsEvents.STATE_CHANGED, (state) => {
  // state: EffectsState — полное состояние контроллера эффектов
});
```

---

## MediaEvents (для авторов плагинов)

`MediaEvents` — внутренний enum `MediaStreamService`. Напрямую нужен только при написании плагинов, когда работаешь с `context.mediaStreamService`:

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

## Когда что использовать

| | `media.on('event', cb)` | `controller.onStateChange(cb)` |
|---|---|---|
| **Данные** | `MediaStreamState` — весь стрим целиком | `CameraState` / `MicrophoneState` — только этот контроллер |
| **Ошибки** | агрегированные, с `source` | только от конкретного контроллера |
| **Когда использовать** | простая реакция на факт события, не нужна детализация | нужны конкретные поля состояния контроллера |

**Используй `media.on()`** если:
- нужно обработать ошибки из любого источника в одном месте
- достаточно знать факт (`videoDisabled`, `mediaReset`) без payload
- строишь общий UI-слой поверх всего модуля

**Используй `controller.onXxx()`** если:
- нужен `CameraState.isPreviewing` или `MicrophoneState.isSpeaking` — поля, которых нет в `MediaStreamState`
- подписываешься рядом с конкретным контроллером (например, в компоненте камеры)
- нужен `onTrackReplaced`, `onVolumeChange` — эти события на уровне модуля недоступны

---

## Типы ошибок

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
