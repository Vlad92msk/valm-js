# Voice Translate

Перевод голоса говорящего на другой язык прямо в браузере. Пользователь вводит **свой** ключ API, выбирает
язык и сам включает перевод; ключ остаётся в его браузере, платит он сам. Переведённая речь заменяет микрофон
в публикуемой дорожке — для звонка это обычная исходящая аудиодорожка, как после шумоподавления: сервер и
другие участники ничего не меняют и слышат язык, выбранный говорящим.

Первый встроенный провайдер — **Gemini Live Translate** (Google). Свой провайдер подключается одним
транспортом, без правки valm (см. [«Свой провайдер»](#свой-провайдер)).

Попробовать: вкладка **«Перевод»** в [Playground](/playground).

> **Перевод выключен по умолчанию.** Пока не вызван `enable()`, valm не открывает соединений, не отправляет
> звук и не трогает дорожку микрофона. Когда и как предлагать перевод пользователю — решает приложение.

## Подключение

Плагин — отдельный subpath-export: без `use(...)` код перевода не попадает в сборку.

```typescript
import { Valm } from 'valm-js'
import { VoiceTranslatePlugin, GeminiLiveTranslateTransport } from 'valm-js/voice-translate'

const media = new Valm().use(new VoiceTranslatePlugin())
const translate = media.voiceTranslateController

// Включить — только по действию пользователя
await translate.enable({
  transport: new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey: userKey } }),
  targetLanguage: 'en',
})

translate.onStateChange((state) => console.log(state.status, state.activity))
translate.onTranscript((t) => t.isFinal && console.log(t.kind, t.turnText))
translate.onError((e) => console.warn(e.reason, e.message))

translate.setTargetLanguage('de')   // переподключает сессию
await translate.disable()           // в граф возвращается исходный голос
```

Что происходит при `enable()`:

- переводчик встаёт в аудио-граф микрофона:
  `source → gain → [шумоподавление] → [перевод] → analyser → destination → публикуемый трек`;
- если граф до этого не работал (не было `setGain`, `onAudioData`, шумоподавления), valm один раз заменит
  публикуемую дорожку — подписчики `microphoneController.onTrackReplaced` получат новый трек (как при
  шумоподавлении); дальше смена языка и выключение перевода дорожку **не** меняют;
- сессия открывается, когда есть микрофон. `enable()` при выключенном микрофоне — можно: сессия откроется вместе
  с ним. Микрофон выключили — сессия закрывается (не платите за тишину), включили — открывается снова;
- пока сессия открывается и пока фраза не переведена, на выходе **тишина**, а не оригинал: иначе собеседники
  услышат и то, и другое;
- микрофон заглушён (`toggleMute`) — звук в сервис не отправляется (`pauseWhenMuted`, по умолчанию `true`).

## Параметры

```typescript
await translate.enable({
  transport,                    // провайдер (обязательно)
  targetLanguage: 'en',         // BCP-47 из transport.info.languages (обязательно)
  sameLanguageSpeech: 'pass',   // речь уже на целевом языке: 'pass' | 'silence'
  originalVolume: 0,            // оригинал под переводом, 0..1
  errorFallback: 'original',    // что звучит при ошибке сессии: 'original' | 'silence'
  pauseWhenMuted: true,         // не слать звук, пока микрофон заглушён
  voiceThreshold: 0.01,         // порог голоса для замера задержки (RMS 0..1)
  phraseGapMs: 700,             // пауза, после которой фраза закончена
})
```

| Параметр | По умолчанию | Зачем |
|---|---|---|
| `targetLanguage` | — | Язык перевода. Язык говорящего определяется сам — выбирать его не нужно |
| `sameLanguageSpeech` | `'pass'` | Человек заговорил на целевом языке: `'pass'` — сервис повторяет речь, собеседники слышат; `'silence'` — в звонке тишина (оригинал не идёт, перевода нет) |
| `originalVolume` | `0` | Режим «оригинал тихо на фоне», например `0.15` |
| `errorFallback` | `'original'` | Сессия упала (лимит, сеть) — собеседники слышат хотя бы исходный голос, а не тишину |
| `pauseWhenMuted` | `true` | Сервисы считают секунды звука — тишину на mute не отправляем |

**Одна сессия — один целевой язык.** `setTargetLanguage()` и `setSameLanguageSpeech()` закрывают сессию и
открывают новую (около секунды тишины, события `reconnecting` → `sessionOpened`). `setOriginalVolume()` и
`setErrorFallback()` меняются на лету.

Список языков объявляет провайдер — `transport.info.languages` (`{ code, name }`). У Gemini — 78 языков.

## Состояние

```typescript
interface VoiceTranslateState {
  isEnabled: boolean                 // enable() вызван (сессии может ещё не быть — нет микрофона)
  status: 'idle' | 'connecting' | 'active' | 'error'
  error: VoiceTranslateError | null  // причина, если status === 'error'
  activity: 'silent' | 'listening' | 'translating'  // молчит / говорит, перевода ещё нет / звучит перевод
  providerId: string | null          // 'gemini-live-translate'
  targetLanguage: string | null
  detectedLanguage: string | null    // язык говорящего, который определил сервис
  isInputPaused: boolean             // звук не отправляется (mute)
  latency: {
    lastStartToFirstAudioMs: number | null  // начало фразы → первый звук перевода
    lastEndToFirstAudioMs: number | null    // конец фразы → начало перевода (null — перевод пошёл во время фразы)
    lastEndToFinishMs: number | null        // конец фразы → конец звучания перевода
    avgStartToFirstAudioMs: number | null
    avgEndToFinishMs: number | null
    samples: number
  }
  usage: { inputSeconds: number; outputSeconds: number }  // для оценки стоимости
}

interface VoiceTranslateError {
  reason: 'invalid-key' | 'quota' | 'network' | 'unsupported' | 'server' | 'unknown'
  message: string           // текст сервиса как есть
  code?: string | number    // код закрытия WebSocket, HTTP-статус, 'RESOURCE_EXHAUSTED'
  providerId: string
}
```

`translate.state` — текущее состояние; `translate.isEnabled` — включён ли перевод.

## События

Все события сервиса доступны приложению: по одному — `translate.on(VoiceTranslateEvents.X, cb)`, все сразу —
`translate.onAny(({ type, payload }) => …)`. Сахар: `onStateChange`, `onTranscript`, `onError`.
Каждая подписка возвращает функцию отписки.

```typescript
import { VoiceTranslateEvents } from 'valm-js/voice-translate'

translate.on(VoiceTranslateEvents.LANGUAGE_DETECTED, ({ languageCode }) => showFlag(languageCode))
translate.onAny((event) => devtoolsLog(event.type, event.payload))
```

| Событие | Данные | Когда |
|---|---|---|
| `enabled` | `{ providerId, targetLanguage }` | вызван `enable()` |
| `disabled` | — | вызван `disable()` |
| `stateChanged` | `VoiceTranslateState` | любое изменение состояния |
| `statusChanged` | `{ status, previous, error }` | смена `idle / connecting / active / error` |
| `activityChanged` | `{ activity, previous }` | говорит / звучит перевод / тишина |
| `latencyChanged` | `latency` | новый замер задержки |
| `usageChanged` | `{ inputSeconds, outputSeconds }` | раз в секунду, пока идёт звук |
| `transcript` | `VoiceTranscriptEvent` | кусок текста оригинала или перевода |
| `languageDetected` | `{ languageCode, previous }` | сервис определил (сменил) язык говорящего |
| `translatedAudio` | `{ durationMs, rms, peak }` | пришёл кусок переведённого звука (уровень 0..1) |
| `interrupted` | — | сервис прервал ответ, недоигранное сброшено |
| `turnComplete` | `{ inputText, outputText }` | ход завершён — итоговый текст |
| `sessionOpened` | `{ providerId, targetLanguage, isReconnect }` | сессия готова принимать звук |
| `sessionClosed` | `{ code?, reason?, willReconnect }` | соединение закрыто |
| `reconnecting` | `{ reason }` | `'go-away'` (лимит соединения), `'language-changed'`, `'options-changed'`, `'graph-restarted'` (смена микрофона) |
| `inputPaused` | `{ isPaused }` | отправка звука приостановлена / возобновлена (mute) |
| `error` | `VoiceTranslateError` | ошибка сессии |
| `providerEvent` | `{ providerId, type, data }` | каждое сообщение сервиса как есть — для отладки |

```typescript
interface VoiceTranscriptEvent {
  kind: 'input' | 'output'   // input — речь говорящего, output — перевод
  text: string               // новый кусок
  isInterim: boolean         // черновик, пока человек говорит (сервис может поправить)
  turnText: string           // весь текст текущего хода (без черновиков)
  isFinal: boolean           // ход завершён: turnText окончательный, text пустой
  languageCode?: string
  timestamp: number
}
```

`providerEvent` несёт сырые сообщения провайдера целиком (у Gemini — `setupComplete`, `serverContent` с
аудио и транскриптами, `goAway`, `usageMetadata`, `close` с кодом) — ничего из ответа сервиса не теряется.
Ключа в них нет.

## Ключ Gemini: как получить

Бесплатный ключ получают за минуту, банковская карта не нужна:

1. Откройте [aistudio.google.com/apikey](https://aistudio.google.com/apikey) и войдите аккаунтом Google.
2. Нажмите **Create API key**. Если AI Studio спросит проект — выберите существующий или создайте новый
   (Google Cloud-проект создаётся автоматически).
3. Скопируйте ключ (строка вида `AIza…`).
4. Вставьте его в поле ключа приложения (в Playground — вкладка «Перевод», поле «Ключ Gemini API») и включите
   перевод.

Ключ остаётся в браузере: valm держит его только в памяти, никуда не сохраняет и не логирует; уходит он только
в Google. Где хранить ключ между визитами (и хранить ли) — решает приложение. Удалить или перевыпустить ключ
можно там же, на странице API keys.

## Лимиты и стоимость

- **Бесплатный уровень** — бесплатно, но Google может использовать отправленные данные для улучшения своих
  продуктов. Для разговоров, которые нельзя отдавать, — платный уровень.
- **Платный уровень** (прайс 2026-11-01): ≈ **$0.0053/мин** входящего звука + **$0.0315/мин** перевода —
  около **$0.037 за минуту** речи. `state.usage` считает секунды для своей оценки.
- Лимиты считаются **на проект** Google Cloud, а не на ключ: несколько ключей одного проекта делят лимит.
- Дневные лимиты обнуляются **в полночь по тихоокеанскому времени**.
- Точные числа запросов в минуту / в день (RPM, RPD) для вашего проекта — в AI Studio
  ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)). Модель
  `gemini-3.5-live-translate-preview` — превью: лимиты у неё строже, чем у стабильных моделей.
- Одно соединение живёт около 10 минут; перед закрытием сервис шлёт `goAway`, и valm сам открывает новое
  (`reconnecting` с `reason: 'go-away'`, короткая пауза в переводе).

## Ошибки

| `reason` | Что значит | Что делать |
|---|---|---|
| `invalid-key` | ключ или токен отвергнут (`API key not valid`, `UNAUTHENTICATED`, `PERMISSION_DENIED`) | проверить, что ключ скопирован целиком и не удалён в AI Studio; создать новый |
| `quota` | `429 RESOURCE_EXHAUSTED` — лимит в минуту или в день | подождать минуту и включить снова; дневной лимит — до полуночи по тихоокеанскому времени; посмотреть лимиты проекта в AI Studio; для больших объёмов — платный уровень |
| `network` | соединение не открылось или оборвалось (код 1006) | интернет, VPN, блокировщики рекламы и корпоративный прокси |
| `unsupported` | в браузере нет `AudioWorklet` или `WebSocket` | свежий Chrome, Edge или Firefox |
| `server` | сервис закрыл сессию с ошибкой | включить снова; текст — в `error.message` |

При ошибке собеседники слышат исходный голос (`errorFallback: 'original'`); чтобы в ошибке была тишина —
`errorFallback: 'silence'`. Сессия после ошибки не переоткрывается сама: показать пользователю причину и
дать включить снова (`disable()` → `enable()`).

## Режимы подключения

```typescript
import { GeminiLiveTranslateTransport, geminiTokenFromApiKey } from 'valm-js/voice-translate'

// 1. Ключ напрямую: ключ в адресе WebSocket. Работает из браузера без сервера;
//    Google называет этот вариант «для тестов» — ключ виден в сетевых инструментах страницы.
new GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey } })

// 2. Эфемерный токен из браузера: браузер обменивает ключ на короткий одноразовый токен
//    (auth_tokens пускает браузер по CORS) и открывает сессию только с токеном —
//    ключ не попадает в URL сокета и логи прокси. Токен выпускается на каждое подключение.
new GeminiLiveTranslateTransport({ auth: { type: 'ephemeral-token', getToken: geminiTokenFromApiKey(apiKey) } })

// 3. Эфемерный токен с сервера приложения: ключа в браузере нет вовсе
new GeminiLiveTranslateTransport({
  auth: { type: 'ephemeral-token', getToken: (setup) => fetch('/api/gemini-token', { method: 'POST', body: JSON.stringify(setup) }).then((r) => r.text()) },
})
```

`getToken(setup)` получает настройки сессии (модель, язык) — их зашивают в токен, чтобы по нему нельзя было
открыть другую сессию. Выпуск токена из ключа — `createGeminiEphemeralToken(apiKey, setup)`.

**Рецепт на будущее — «минтер».** Если платит приложение, а не пользователь, ключ живёт в секретах маленького
сервера (например, Cloudflare Worker без логов и хранилища), который отдаёт своим пользователям токены через
`createGeminiEphemeralToken`; звук по-прежнему идёт из браузера напрямую в Google. В valm такого сервера нет —
это вариант 3 со своей стороны.

## Свой провайдер

Провайдер — транспорт «PCM16 на входе → PCM16 на выходе». Аудио-граф, ресемплинг, тишина до готовности,
замер задержки, транскрипты, состояние и события — общие (`VoiceTranslator`), транспорт отвечает только за
сеть и протокол сервиса.

```typescript
import type { IVoiceTranslationTransport, VoiceTranslationTransportEvents, VoiceTranslateSessionOptions } from 'valm-js/voice-translate'

class MyTransport implements IVoiceTranslationTransport {
  readonly info = {
    id: 'my-service',
    label: 'My Service',
    format: { inputSampleRate: 24000, outputSampleRate: 24000, chunkMs: 100 },  // valm сам ресемплирует
    languages: [{ code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }],
    authModes: ['ephemeral-token'] as const,
    capabilities: { sourceAutoDetect: true, sameLanguagePass: false, voiceSelection: false },
    links: { apiKey: 'https://example.com/keys' },
  }

  connect(options: VoiceTranslateSessionOptions, events: VoiceTranslationTransportEvents): void {
    // открыть соединение; options.targetLanguage, options.sameLanguageSpeech
    // events.onOpen() → events.onReady()             — сессия готова
    // events.onAudio(pcm16)                           — кусок перевода (info.format.outputSampleRate)
    // events.onTranscript({ kind, text, isInterim })  — тексты
    // events.onInterrupted() / onTurnComplete()
    // events.onError({ reason: 'quota', message, code })
    // events.onClose({ code, reason, willReconnect }) / onReconnecting('go-away')
    // events.onRawEvent(type, data)                   — каждое сообщение сервиса
  }
  sendAudio(pcm: Int16Array): void { /* PCM16 моно, inputSampleRate, по chunkMs */ }
  endAudioStream(): void { /* необязательно: микрофон заглушён */ }
  close(): void { /* закрыть соединение; после close событий больше не слать */ }
}

await translate.enable({ transport: new MyTransport(), targetLanguage: 'es' })
```

Правила транспорта: не начинать отправку до `onReady()`; ошибки — через `onError` с одной из причин
(`invalid-key`, `quota`, `network`, `server`), исходный текст и код сервиса — в `message` и `code`; ключи не
передавать в `onRawEvent` и не писать в консоль.

Перевод — обработчик слота `'voice-translation'` аудио-графа ядра (`IAudioProcessorProvider`); `VoiceTranslator`
можно поставить и вручную через `mediaStreamService.getAudioProcessingPipeline().setProcessor(...)`, но
обычно достаточно контроллера.

## Gemini Live Translate: детали протокола

| | |
|---|---|
| Модель | `gemini-3.5-live-translate-preview` (превью) — только перевод речь → речь |
| Соединение | WebSocket `…GenerativeService.BidiGenerateContent?key=…` или `…BidiGenerateContentConstrained?access_token=…` |
| Вход | PCM16 LE, 16 кГц, моно, чанки по 100 мс (`audio/pcm;rate=16000`); текст на вход не принимается |
| Выход | PCM16 LE, 24 кГц, моно |
| Языки | 78 целевых (`GEMINI_TRANSLATE_LANGUAGES`); исходный определяется сам |
| Речь на целевом языке | `translationConfig.echoTargetLanguage` (`sameLanguageSpeech: 'pass'` → `true`) |
| Голос | выбрать нельзя, может «плавать» |

Первое сообщение после открытия сокета:

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

`inputAudioTranscription` / `outputAudioTranscription` — поля самого `setup`, а не `generationConfig`: пример
на странице Live translate кладёт их в `generationConfig`, и сырой WebSocket отвечает
`Unknown name "inputAudioTranscription" at 'setup.generation_config'`. Тело `auth_tokens` в REST —
`{ uses, expireTime, newSessionExpireTime, bidiGenerateContentSetup }`; поле `liveConnectConstraints` из примеров
документации — форма SDK, REST его отвергает.

## Ограничения

- **Голос не выбрать** — Gemini озвучивает нейтральным голосом, он может меняться между фразами.
- **Нужны наушники**: перевод из динамиков снова попадёт в микрофон.
- **Задержка**: перевод идёт во время фразы, но отстаёт от речи — точные цифры показывает `state.latency`.
- **Браузеры**: Chrome и Firefox — аудио-граф и протокол проверены; **Safari не проверялся**.
- Сессия с ошибкой не переоткрывается сама — это решение пользователя.
- Перевод работает на стороне говорящего: все собеседники слышат один выбранный им язык.
