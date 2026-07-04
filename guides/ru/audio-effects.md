# AudioEffectsPlugin

ML-обработка звука микрофона (шумоподавление и т.п.) как подключаемый плагин —
по образцу [`EffectsPlugin`](./effects.md) для видео. Ядро отвечает за лёгкое
(gain + визуализация, см. [microphone.md](./microphone.md)); тяжёлые ML-провайдеры
подключаются только через этот плагин, чтобы их зависимости не попадали в ядро.

Импортируется отдельным subpath-export — без `use(...)` ничего не грузится.

## Подключение

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

Плагин вставляет узел провайдера в аудио-граф микрофона:

```
source → gain → [ML node] → analyser → destination
```

При подключении с провайдером граф активируется: публикуемый аудио-трек
заменяется на обработанный (подписчики `mic.onTrackReplaced` получат новый трек).
`gain` и визуализация из ядра продолжают работать поверх ML-обработки.

---

## Провайдеры

Провайдер — объект, создающий `AudioNode` в переданном `AudioContext` графа:

```typescript
interface IAudioNoiseSuppressionProvider {
  createNode(context: AudioContext): Promise<AudioNode> | AudioNode
  destroy?(): void
}
```

### RNNoiseProvider

Шумоподавление на базе RNNoise. Ожидает готовый AudioWorklet-модуль (сам DSP/wasm
в пакет не входит, чтобы не тянуть тяжёлую зависимость):

```typescript
new RNNoiseProvider({
  workletUrl: '/worklets/rnnoise.js',  // обязателен
  processorName: 'rnnoise-processor',  // по умолчанию 'rnnoise-processor'
})
```

### AudioWorkletProvider

Базовый провайдер: загружает произвольный AudioWorklet-модуль и создаёт узел.
На нём удобно строить собственные ML-провайдеры:

```typescript
import { AudioWorkletProvider } from 'valm-js/audio-effects';

new AudioWorkletProvider({
  workletUrl: '/worklets/my-denoiser.js',
  processorName: 'my-denoiser',
  processorOptions: { intensity: 0.8 },
})
```

### Свой провайдер

```typescript
import { IAudioNoiseSuppressionProvider } from 'valm-js/audio-effects';

class MyProvider implements IAudioNoiseSuppressionProvider {
  createNode(context: AudioContext): AudioNode {
    const node = context.createGain(); // ← ваш обрабатывающий узел
    return node;
  }
  destroy() { /* освободить ресурсы */ }
}

media.use(new AudioEffectsPlugin({ providers: { noiseSuppression: new MyProvider() } }));
```

---

## API

| Экспорт | Описание |
|---------|----------|
| `AudioEffectsPlugin` | Плагин ML-обработки звука (`media.use(...)`) |
| `RNNoiseProvider` | Провайдер RNNoise поверх AudioWorklet |
| `AudioWorkletProvider` | Базовый провайдер на AudioWorklet |
| `IAudioNoiseSuppressionProvider` | Интерфейс провайдера для своих реализаций |

### AudioEffectsPluginOptions

```typescript
interface AudioEffectsPluginOptions {
  providers?: {
    noiseSuppression?: IAudioNoiseSuppressionProvider
  }
}
```
