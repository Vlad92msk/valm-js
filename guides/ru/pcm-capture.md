# PCM Capture

Узел аудио-графа, который превращает **любой** аудио-вход в поток PCM16 моно нужной частоты чанками фиксированной
длины, с громкостью (RMS) каждого чанка. Ничего не воспроизводит и никуда не отправляет — чанки получает приложение.

Это формат, который ждут почти все сервисы потокового распознавания и голосовых моделей (16 кГц или 24 кГц,
16 бит, моно, кусками по 100–250 мс). Что с чанками делать дальше — отправить в WebSocket, записать, посчитать
VAD — решает приложение; `PcmCapture` к сервисам не привязан.

Вход — что угодно, что подключается к `AudioNode`: свой микрофон, удалённый трек собеседника из WebRTC,
`<audio>`-элемент, осциллятор.

## Подключение

Отдельный subpath-export: без импорта код не попадает в сборку. Плагин и `Valm` не нужны.

```typescript
import { PcmCapture, pcm16ToBase64 } from 'valm-js/pcm-capture'

const ctx = new AudioContext()
const source = ctx.createMediaStreamSource(new MediaStream([remoteTrack]))

const capture = await PcmCapture.create(ctx, { sampleRate: 16000, chunkMs: 100 })
source.connect(capture.node)

const off = capture.onChunk(({ pcm, rms }) => {
  // pcm: Int16Array, 1600 сэмплов; rms: 0..1
  socket.send(JSON.stringify({ audio: pcm16ToBase64(pcm) }))
})

capture.setPaused(true)   // собеседник заглушён — поток стоит
capture.setPaused(false)

off()                     // отписка
capture.dispose()         // отключить узел и остановить ворклет
```

## API

```typescript
interface PcmCaptureOptions {
  sampleRate?: number   // частота выхода, Гц (по умолчанию 16000)
  chunkMs?: number      // длина чанка, мс (по умолчанию 100)
  paused?: boolean      // создать на паузе (по умолчанию false)
}

interface PcmCaptureChunk {
  pcm: Int16Array       // моно, sampleRate × chunkMs / 1000 сэмплов
  rms: number           // средняя громкость чанка, 0..1
}

class PcmCapture {
  static create(ctx: BaseAudioContext, options?: PcmCaptureOptions): Promise<PcmCapture>
  readonly node: AudioWorkletNode   // вход; выходов нет
  readonly sampleRate: number
  readonly chunkMs: number
  readonly isPaused: boolean
  readonly isDisposed: boolean
  onChunk(cb: (chunk: PcmCaptureChunk) => void): () => void
  setPaused(paused: boolean): void
  dispose(): void
}

// base64 ⇄ PCM16 little-endian — для JSON-протоколов
pcm16ToBase64(pcm: Int16Array): string
base64ToPcm16(base64: string): Int16Array
```

| Что | Как ведёт себя |
|---|---|
| `create()` | Грузит ворклет из Blob URL один раз на контекст (в том числе при параллельных вызовах). Файл в `public/` не нужен; при строгом CSP нужен `script-src blob:`. Бросает `RangeError` на неположительные `sampleRate`/`chunkMs` и `Error`, если в браузере нет AudioWorklet |
| `node` | Только вход, **выходов нет**: подключать к `destination` не нужно и нельзя — браузер обрабатывает узел сам, ничего не звучит. Стерео и больше каналов сводятся в моно |
| Тишина на входе | Поток не прерывается: идут чанки с нулями и `rms: 0`. Сервисы распознают конец фразы по паузе — прерывать поток нельзя. Не хотите платить за тишину — ставьте паузу |
| `setPaused(true)` | Чанки не идут, ворклет ничего не копит: недособранный чанк выбрасывается. Чанки, отправленные ворклетом до паузы, но не доставленные, тоже отбрасываются |
| `setPaused(false)` | Первый чанк — полный, целиком из звука после снятия паузы |
| `dispose()` | Отписывает всех, отключает узел от входов, ворклет перестаёт работать. Повторный вызов ничего не делает. Контекст не закрывает — он ваш |

## Ресемплинг

ФНЧ (срез ~0,45 от выходной частоты) и линейная интерполяция с частоты контекста до `sampleRate`. Для речи
этого хватает; захват тот же, что у [перевода голоса](./voice-translate.md) — один исходник на оба.

## Контекст

- `AudioContext` до жеста пользователя может быть `suspended` — тогда чанки не идут. Вызовите `ctx.resume()`
  по клику.
- Несколько узлов на одном контексте — можно, с разными параметрами (например, по узлу на каждого собеседника).
- Удалённый трек WebRTC в Chrome: чтобы `MediaStreamAudioSourceNode` получал звук, трек обычно должен ещё и
  проигрываться медиа-элементом. Надёжнее всего — тем же `<audio>`, что его и так играет; запасной элемент —
  с `volume = 0`, а не `muted`: у заглушённого элемента Chrome может не запускать вывод, и в граф приходит тишина.
  Это поведение Chrome, а не узла.
