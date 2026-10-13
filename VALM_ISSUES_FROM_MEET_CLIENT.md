# valm-js 1.0.0: проблемы, найденные при интеграции в google_meet_clone_client

Дата: 2026-09-26. Источник: переключение устройств в `google_meet_clone_client` (см. `REPORT_DEVICES_FIX.md` → «Что остаётся открытым → valm-js» и `AUDIT_DEVICES.md` §6).
Код библиотеки проверен по `packages/valm/src` (версия 1.0.0). Код не менялся ни в библиотеке, ни в приложении.

Пути ниже даны относительно `packages/valm/src/`. Пути приложения начинаются с `app:` (`/Users/vlad/web_dev/google_meet_clone_client/src/`).

Вердикты: **ПОДТВЕРЖДЕНО** (видно по коду), **УТОЧНЕНО** (подтверждено, но механизм или масштаб другие), **ОПРОВЕРГНУТО**. Пункты с пометкой **[NEW]** найдены при чтении кода и в исходном списке их нет.

---

## Статус исправлений

Все пункты закрыты. Проверки: `tsc --noEmit`, `vite build`, e2e от исходников (`VALM_SOURCE=src`) — 209 passed, 1 skipped (нужны 2 микрофона). Новые тесты: `e2e/device-robustness.spec.ts`, плюс по одному в `camera.spec.ts` и `microphone.spec.ts`.

- [x] #6 + N6 — видео: gUM до остановки pipeline; ошибка `pipeline.start()` → сырой трек + `ERROR` (`startPipelineSafe`)
- [x] #5 — аудио: mute переживает смену устройства (VAD при mute не стартует); ошибка графа не убивает новый трек
- [x] #3 + N5 — `switchDevice(deviceId | null, { force? })` у микрофона и камеры ждёт реальной смены, бросает ошибку и возвращает `SwitchResult { applied, deviceId, reason?: 'noop' | 'superseded' | 'disabled' }`
- [x] N1 — откат `deviceId` в конфиге при неудачной смене (микрофон и камера)
- [x] #2 + N9 — опция `audio/video.deviceFallback: 'none' | 'default'` (по умолчанию `'none'`), события `onDeviceFallback`. Вариант B: выбранный `deviceId` остаётся в конфиге, при повторном подключении (devicechange) контроллер возвращается на него. Комментарий iOS-constraints исправлен
- [x] #1 — `DevicesState.defaults { microphone, speaker, communicationsMicrophone }`; `onDeviceDisconnected` только из devicechange, по последнему открытому устройству (переживает `ended`), без виртуальных id, с дедупликацией
- [x] #4 — `switchDevice(id, { force: true })`, `reacquire()`, `devicesController.onDefaultDeviceChanged`, опция `audio.followSystemDefault`
- [x] #8 — `onSourceMuteChange`, `state.isSourceMuted` (микрофон и камера); слушатели на сыром треке через единый `setTrack()`
- [x] N2 — `onTrackEnded({ reason: 'device-lost' | 'ended', deviceId, groupId, label })`; при `deviceFallback: 'default'` и пропаже устройства — автовосстановление на системное (`onDeviceFallback` с `reason: 'device-lost'`). `config.enabled` после `ended` не трогается (намерение пользователя), это задокументировано в коде
- [x] N3 — мобильный путь: `TRACK_REMOVED` с выходным треком; при ошибке возврат на прежнюю камеру (по `lastDevice`, т. к. конфиг уже указывает на новую), иначе `isEnabled=false` + `STATE_CHANGED`; мобильная ветка только при живом треке
- [x] N4 — `MediaEvents.ERROR` несёт `kind`, контроллеры фильтруют чужие ошибки
- [x] N7 — видео-mute глушит и сырой, и выходной трек; `suspend/resumePipeline` сохраняют mute
- [x] N8 — `microphone.enable(id)` делает одно переключение; `camera.enable(id)` при включённой камере = `switchDevice`
- [x] #7 — `setOutputDevice(id | null): Promise<boolean>` (вариант «б»): неизвестный id или отказ всех элементов → `false` + `onError`; `'default'`/`null` → `setSinkId('')`; пустой кэш → тихий `enumerateDevices`; state `{ deviceId, preferredDeviceId, isFallback }`, `onDeviceLost` и возврат при повторном подключении; `autoSelectSpeakerphone` без совпадения ничего не выбирает
- [x] Документация: `guides/{en,ru}/{camera,microphone,devices}.md` (llms перегенерированы)

Для changelog (меняется поведение): `switchDevice` у микрофона теперь реально ждёт и бросает ошибку; `setOutputDevice` возвращает `boolean`; `onDeviceDisconnected` больше не срабатывает на `'default'` и на вызов `getAvailable()`; `DevicesState` получил обязательное поле `defaults`.

Доделано во втором заходе: `sourceMuteDebounceMs` (аудио и видео), `isMuted` в `onTrackReplaced`, раздел README «SFU integration» (mediasoup `disableTrackOnPause`), `packages/valm/CHANGELOG.md`. e2e: 211 passed.

**Осталось (следующий раз):**
- [x] `pipeline.switchInput(newTrack)` — бесшовная смена камеры с эффектом без пересоздания `frameOutput` и без `TRACK_REPLACED` для SFU (этап 2 из #6). Сделано 2026-10-13 (не опубликовано, CHANGELOG → Unreleased): пока pipeline работает, меняется только его вход; при ошибке `switchInput` или pipeline без этого метода — прежний перезапуск с `TRACK_REPLACED`. Мобильный путь тоже через `switchInput` (старый трек по-прежнему останавливается до gUM). Тесты: три новых в `e2e/camera.spec.ts` (успех, pipeline без `switchInput`, мобильный путь с подменой UA); e2e от исходников — 214 passed, 1 skipped. На реальном телефоне не проверялось (см. §10).
- [ ] §10 — ручная проверка на реальном железе (BT-гарнитура, выдёргивание USB, занятая камера, Firefox/Safari).

---

## 0. Сводка и приоритеты

| # | Проблема | Вердикт | Приоритет | Последствия |
|---|---|---|---|---|
| 6 | `VideoTrackManager.replaceTrack` останавливает pipeline эффектов до `getUserMedia` | ПОДТВЕРЖДЕНО (хуже, чем в аудите) | **P1** | При неудачной смене камеры с эффектом собеседники видят замёрзшее или чёрное видео, событий нет |
| 5 | `AudioTrackManager.replaceTrack` теряет mute | ПОДТВЕРЖДЕНО, и баг уже достижим через публичный API | **P1** | «Горячий микрофон» при UI «заглушён» (приватность) |
| 2 | `deviceId: { exact }` без fallback | ПОДТВЕРЖДЕНО + [NEW] конфиг «отравляется» после неудачи | **P1** | После отключения устройства или одной неудачной смены `enable()` падает навсегда |
| 3 | `microphone.switchDevice` резолвится до переключения | ПОДТВЕРЖДЕНО | **P1** | Ошибку смены нельзя поймать; API несимметричен с камерой |
| 1 | `getAvailable` выкидывает `'default'`; ложный `onDeviceDisconnected` | ПОДТВЕРЖДЕНО + УТОЧНЕНО (бывают и ложные пропуски) | P2 | Нельзя показать «По умолчанию»; событие отключения ненадёжно в обе стороны |
| 4 | Нельзя принудительно переоткрыть `'default'` | ПОДТВЕРЖДЕНО (блокируют два слоя) | P2 | При подключении BT-гарнитуры в режиме «По умолчанию» звук идёт со старого микрофона |
| 8 | Нет `onmute`/`onunmute` | ПОДТВЕРЖДЕНО + УТОЧНЕНО (обход в приложении ломается при включённом аудио-графе) | P2 | Тишина при UI «микрофон включён» |
| 7 | `setOutputDevice` молча игнорирует неизвестный id | ПОДТВЕРЖДЕНО + [NEW] ещё 3 дефекта в том же методе | P2 | UI показывает не тот вывод; в Firefox/Safari не вернуть «По умолчанию» |

Новые проблемы (подробности в §9):

| # | Проблема | Приоритет |
|---|---|---|
| N1 | После неудачной смены в конфиге остаётся битый `deviceId` (микрофон и камера) | P1 (исправлять вместе с #2/#3) |
| N2 | Пропажу устройства (`ended`) нельзя отличить от `disable()`; `config.enabled` остаётся `true` | P2 |
| N3 | Мобильный путь `replaceTrackMobile`: при ошибке `track=null`, `isEnabled=true`, событий нет; `TRACK_REMOVED` приходит с сырым треком вместо выходного | P2 |
| N4 | `MediaEvents.ERROR` уходит в `onError` и камеры, и микрофона | P3 |
| N5 | Вытесненный `switchDevice` резолвится как успешный | P3 |
| N6 | Ошибка `pipeline.start()` после подмены трека оставляет producer на мёртвом треке (аудио и видео) | P3 |
| N7 | Видео-mute теряется при `suspendPipeline`/`resumePipeline` | P3 (через публичный API сейчас недостижимо) |
| N8 | `microphone.enable(id)` при включённом микрофоне делает два переключения | P3 |
| N9 | iOS-constraints: комментарий обещает `ideal`, а код ставит `exact` для `deviceId` | P3 (часть #2) |

**Рекомендуемый порядок исправлений:**
1. #6 (+N6): маленький локальный фикс, самые заметные последствия.
2. #5 (+N7): несколько строк, вопрос приватности.
3. #3 + #2 + N1 + N5 одним PR: контракт `switchDevice`, fallback и откат конфига трогают один и тот же код.
4. #1 + #4: всё про `'default'` вместе (отдельное поле `default`, `force`, событие смены системного устройства).
5. #8 + N2: события о здоровье трека (`sourceMuted`, `trackEnded` с причиной).
6. #7: переделать `AudioOutputController` (строгий `setOutputDevice`, `''` для default, реакция на пропажу sink).
7. N3, N4, N8: мелочи, можно попутно.

---

## 1. `DevicesController.getAvailable` фильтрует `'default'`; ложный `onDeviceDisconnected`

**Вердикт: ПОДТВЕРЖДЕНО, УТОЧНЕНО.**

### Код
- `core/media-stream/controllers/devices.controller.ts:43-45`: у всех трёх видов выкидываются `deviceId === 'default'` и `''`. `'communications'` (Chrome/Windows) остаётся.
- `core/valm.ts:67-72`: «активные» id берутся из `mediaStreamService.getState().currentAudioDevice`, то есть из `track.getSettings().deviceId` (`audio-track-manager.service.ts:297`).
- `devices.controller.ts:61, 70-88`: `checkDeviceDisconnection()` ищет активный id в **уже отфильтрованном** списке.

### Проблема
1. В Chrome у трека, открытого без `deviceId` или с `'default'`, `getSettings().deviceId === 'default'`. Это поведение Chrome, его наблюдали в приложении (AUDIT #4). Такого id в `cachedDevices.microphones` нет по построению, поэтому на **каждом** вызове `getAvailable()` приходит `onDeviceDisconnected({kind:'microphone', deviceId:'default'})`.
2. Уточнение: срабатывание привязано не только к `devicechange`. Оно происходит при **любом** вызове `getAvailable()`, в том числе от самого приложения, и без дедупликации: пока устройство «отсутствует», событие повторяется при каждом вызове.
3. Уточнение, **ложные пропуски**: при настоящем отключении устройства трек получает `ended`. `handleTrackEnded` (`audio-track-manager.service.ts:462-475`, `video-track-manager.service.ts:474-503`) обнуляет `track`, и `currentAudioDevice` становится `null`. Если `ended` пришёл раньше `devicechange` (в Chrome обычно так и бывает), `checkDeviceDisconnection` видит `active.microphone === null` и **ничего не шлёт**. Выходит, что событие срабатывает, когда устройство на месте, и может промолчать, когда его выдернули.
4. Проверяется только активный трек. Если микрофон выключен, а в конфиге сохранён пропавший `deviceId`, события нет (это прямо связано с #2).
5. Для UI фильтр `'default'` убирает пункт «По умолчанию — X», а текущее устройство нельзя сопоставить со списком: `state.deviceId === 'default'`, а в списке такого id нет.

### Repro
Chrome, desktop: `valm.microphoneController.enable()` без deviceId → `devicesController.onDeviceDisconnected(console.log)` → `await devicesController.getAvailable()`. В консоли `{kind:'microphone', deviceId:'default'}`. Каждый следующий `getAvailable()` печатает то же самое.

### Последствия для приложений
Автопереключение нельзя вешать на `onDeviceDisconnected`: в режиме «По умолчанию» оно сработает сразу. Приложение этот API не использует: оно строит список из `enumerateDevices` само (`app:services/media-module/devices/device-list.store.ts`, `device-options.ts`) и сверяет устройства по `groupId`/`label` (`app:.../device-watcher.ts:89-130`).

### Решение
API (обратно совместимо):
```ts
interface DevicesState {
  cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[]  // как сейчас, без 'default'
  defaults: {                       // новое
    microphone: MediaDeviceInfo | null   // запись 'default' (Chrome) или null
    speaker: MediaDeviceInfo | null
    communicationsMicrophone?: MediaDeviceInfo | null  // 'communications' на Windows
  }
}
// опционально: getAvailable({ includeVirtual: true }) — не фильтровать 'default'/'communications'
```
Реализация:
- `checkDeviceDisconnection` должна сравнивать **физическое устройство**, а не id. Для виртуального id (`'default'`, `'communications'`) событие не отправлять. Физическое устройство активного трека определять по `getSettings().groupId` и `track.label` и сопоставлять с `groupId` у реальных записей.
- Хранить `lastActive = { deviceId, groupId, label }` на момент открытия трека (в TrackManager, при acquire/replace). Тогда проверка работает и после `ended`: на `ended` менеджер сохраняет `lastActive`, а DevicesController проверяет его наличие в списке. Это закрывает ложные пропуски.
- Дедупликация: слать событие один раз на переход «есть → нет» для конкретного `groupId`/`deviceId`.
- Не вызывать `checkDeviceDisconnection` из публичного `getAvailable()`, только из обработчика `devicechange`, либо отделить внутренний `refresh()`.
- Добавить `kind: 'speaker'` для выбранного вывода (см. #7).

Обратная совместимость: массивы остаются прежними. Меняется только семантика `onDeviceDisconnected`: исчезают ложные срабатывания на `'default'`, приходят настоящие события после `ended`. Отметить это в changelog.

Тесты (Playwright, Chromium с fake-devices):
- mock `enumerateDevices` через `page.addInitScript` так, чтобы он возвращал запись `'default'` + 2 реальных. Проверить, что `state.defaults.microphone` заполнено, а `microphones` без `'default'`.
- mic на `'default'` → `getAvailable()` ×3 → `onDeviceDisconnected` не вызван ни разу.
- mic на реальном id → mock убирает устройство из списка + `track.stop()`/dispatch `ended` → `dispatchEvent(new Event('devicechange'))` → событие вызвано ровно 1 раз при любом порядке `ended`/`devicechange`.

---

## 2. `deviceId: { exact }` без fallback на `OverconstrainedError`

**Вердикт: ПОДТВЕРЖДЕНО.** Плюс [NEW] N1 и N9.

### Код
- `core/media-stream/constraints-builder.service.ts:16` (аудио), `:50` (видео), `:30` (iOS-видео; комментарий на `:5`/`:24` обещает «ideal вместо exact», но для `deviceId` стоит `exact`, см. N9).
- Этот builder используют все пути получения трека: `audio-track-manager.service.ts:328, 373`, `video-track-manager.service.ts:366`, `microphone.controller.ts:172` (preview), `media-stream.service.ts:93` (`createAdditionalVideoTrack`).
- Классификация `OverconstrainedError`/`NotFoundError` есть только в `core/utils/ios-media.helper.ts:156-170` (текст для пользователя), нигде в логике получения трека её нет.

### Проблема
Когда выбранного устройства нет, `getUserMedia` отдаёт `OverconstrainedError` (`constraint: 'deviceId'`) или `NotFoundError`. Библиотека пробрасывает ошибку наружу, конфиг не трогает. `config.deviceId` остаётся указывать на пропавшее устройство, поэтому **каждый** следующий `enable()` падает, пока приложение само не вызовет `setAudioDevice(null)`.

Путь до такого состояния:
1. Выбран BT-микрофон X → гарнитуру выключили → `ended` → `handleTrackEnded` → `isEnabled=false` (N2).
2. Пользователь жмёт «включить микрофон» → `buildAudioConstraints({deviceId: X})` → `OverconstrainedError`.

### Repro
`microphoneController.enable(realId)` → в DevTools подменить `navigator.mediaDevices.getUserMedia`, чтобы для `exact: realId` он бросал `new OverconstrainedError('deviceId')` (или физически выдернуть USB-микрофон) → `disable()` → `enable()` → reject. Повторный `enable()` снова reject.

### Последствия для приложений
После отключения устройства пользователь не может включить микрофон или камеру. Приложение закрыло это сбросом конфига (`app:.../device-watcher.ts:96-108, 209-215`) и откатом конфига после неудачной смены (`app:.../device-selection.ts:116-119, 140-143`). Эту логику неизбежно повторит каждый потребитель библиотеки.

### Решение
API:
```ts
interface AudioConfiguration / VideoConfiguration {
  deviceId: string | null
  // новое:
  deviceFallback?: 'none' | 'default'   // default: 'default' в 2.0; в 1.x по умолчанию 'none' или opt-in
}
// событие
microphoneController.onDeviceFallback((e: { requestedDeviceId: string; actualDeviceId: string | null; reason: 'overconstrained' | 'not-found' }) => void)
cameraController.onDeviceFallback(...)
```
Реализация (в `acquireTrack`/`replaceTrack`/`getNewTrack`):
```ts
try {
  stream = await gUM({ audio: constraints })
} catch (e) {
  const isMissing = e.name === 'NotFoundError' ||
                    (e.name === 'OverconstrainedError' && (e as OverconstrainedError).constraint === 'deviceId')
  if (!isMissing || !effectiveConfig.deviceId || cfg.deviceFallback !== 'default') throw e
  stream = await gUM({ audio: { ...constraints, deviceId: undefined } })
  this.emit(FALLBACK, { requestedDeviceId: effectiveConfig.deviceId, actualDeviceId: track.getSettings().deviceId ?? null, reason })
}
```
- Что делать с `config.deviceId` после fallback. Вариант A: сбросить в `null` (просто, но теряется предпочтение). Вариант B, рекомендуется: хранить `preferredDeviceId` отдельно от «фактического». Тогда при повторном подключении (`devicechange` + устройство снова в списке) можно автоматически вернуться, как Google Meet. B можно отложить, A покрывает основной сценарий.
- Альтернатива попроще: опция `deviceIdConstraint: 'exact' | 'ideal'`. У `ideal` есть минус: при отсутствии устройства браузер тихо открывает другое, приложение об этом не узнаёт, а `getSettings().deviceId` расходится с конфигом. Явный fallback с событием лучше.
- Обработку `NotReadableError` (устройство занято) fallback не трогает, эта ошибка должна дойти до вызывающего.

Обратная совместимость: в 1.x опция opt-in, поведение по умолчанию не меняется. В 2.0 можно включить `'default'` по умолчанию. Событие новое.

Тесты:
- mock gUM: для `deviceId.exact === 'gone'` бросает `OverconstrainedError('deviceId')`, иначе вызывает оригинал. `configuration.setAudioDevice('gone'); microphone.enable()` → с `deviceFallback:'default'` трек есть, `onDeviceFallback` вызван 1 раз. С `'none'` → reject, трека нет.
- То же для камеры и для `switchDevice` при включённом устройстве (старый трек должен продолжить работать, если fallback выключен).
- `NotReadableError` → fallback не выполняется.

---

## 3. `microphone.switchDevice` резолвится до реального переключения

**Вердикт: ПОДТВЕРЖДЕНО.**

### Код
- `core/media-stream/controllers/microphone.controller.ts:221-228`: `switchDevice` только вызывает `configService.setAudioDevice(deviceId)`.
- `configService.emit` синхронный (`core/configuration/mixins/base.mixin.ts:56-68`, `core/utils/typed-event-emitter.ts:15-17`), слушатель `async` (`microphone.controller.ts:42-44`). Промис `handleConfigurationChange` (`:57-71`) никто не ждёт, его ошибка уходит только в `onError` с `action: 'configUpdate'`.
- Для сравнения камера: `camera.controller.ts:127-141` ставит флаг `isSwitchingDevice`, сама `await`-ит `mediaStreamService.switchVideoDevice(deviceId)` и бросает ошибку.
- Косвенное подтверждение в собственных e2e: `e2e/microphone.spec.ts:66-68` после `switchDevice` использует `expect.poll`, чтобы дождаться события.

### Проблема
`await microphone.switchDevice(id)` возвращается сразу, трек ещё старый. `try/catch` вокруг вызова не ловит ошибки `getUserMedia`. Вдобавок `switchDevice(id)` с id, равным текущему, не делает ничего и не шлёт событий, поэтому «ждать `onTrackReplaced`» тоже нельзя без дополнительных проверок.

### Repro
```js
await valm.microphoneController.enable()
const before = valm.microphoneController.getTrack()
await valm.microphoneController.switchDevice(otherId)
valm.microphoneController.getTrack() === before   // true
```
С недоступным id: `await switchDevice('bad')` резолвится, а ошибка приходит отдельно в `onError`.

### Последствия для приложений
Селектор не может показать «переключаю…», ошибку под полем или откатить выбор. Приложение обернуло вызов в `waitForTrackSwitch` (`app:.../device-selection.ts:55-86`): подписка на `onTrackReplaced`/`onError`/`onStateChange` + таймаут 10 с. Обёртка хрупкая: из-за N4 она ловит и чужие ошибки (камеры).

### Решение
API: `switchDevice(deviceId: string | null): Promise<SwitchResult>`, где
```ts
type SwitchResult = { applied: boolean; deviceId: string | null }   // applied=false: no-op или вытеснено (N5)
```
Возврат объекта вместо `void` совместим со всеми текущими вызовами.

Реализация (повторить схему камеры):
```ts
switchDevice = async (deviceId) => {
  const prev = this.configService.getAudioConfig().deviceId
  this.isSwitchingDevice = true
  try {
    this.configService.setAudioDevice(deviceId)
    if (this.state.isEnabled) await this.mediaStreamService.switchAudioDevice(deviceId ?? undefined)
  } catch (error) {
    this.configService.setAudioDevice(prev)       // N1: откат конфига (под isSwitchingDevice, без повторного switch)
    this._notifyError({ source: 'microphone', action: 'switch', error })
    throw error
  } finally { this.isSwitchingDevice = false }
}
// handleConfigurationChange: `if (event.property === 'deviceId' && !this.isSwitchingDevice && ...)`
```
- `AudioTrackManager.switchDevice`/`VideoTrackManager.switchDevice` должны возвращать, был ли трек фактически заменён (no-op, вытеснено, заменено).
- Для внешнего `configuration.setAudioDevice()` поведение не меняется: асинхронно, ошибка в `onError`. Но в `onError` полезно передавать `action: 'switch'` и `deviceId`.
- Та же правка закрывает N8.

Обратная совместимость: `switchDevice` начинает реально ждать и бросать. Код, который вызывал его без `await`/`catch`, получит unhandled rejection при ошибке. Это в changelog как bugfix: у камеры контракт уже такой.

Тесты:
- `enable()` → `await switchDevice(mics[1])` → сразу после await `getTrack().getSettings().deviceId === mics[1]` (без `poll`).
- mock gUM с reject → `switchDevice('bad')` reject-ится; `getAudioConfig().deviceId` равен прежнему; старый трек `live`.
- `switchDevice(currentId)` → `{ applied: false }`, событий нет.
- Микрофон выключен → `switchDevice(id)` меняет только конфиг, `{ applied: false }`.

---

## 4. Нет способа принудительно переоткрыть `'default'`

**Вердикт: ПОДТВЕРЖДЕНО. Блокируют два слоя.**

### Код
1. `microphone.controller.ts:61`: переключение выполняется только при `event.newValue !== event.oldValue`. `setAudioDevice('default')`, когда в конфиге уже `'default'`, ничего не делает.
2. `audio-track-manager.service.ts:223-228` (и `video-track-manager.service.ts:257-262`): если `track.getSettings().deviceId === targetDeviceId` и трек `live`, выход. Для трека на `'default'` в Chrome `currentDeviceId === 'default'`, поэтому `switchDevice('default')` всегда no-op.

Побочный (случайный) путь: когда в конфиге `'default'`, вызов `setAudioDevice(null)` даёт `targetDeviceId = undefined` → проверка `targetDeviceId &&` не проходит → `replaceTrack` без `deviceId` переоткрывает дефолт. То есть сейчас «force» можно получить только чередованием `null`/`'default'` в конфиге. Это недокументированное поведение, полагаться на него не стоит.

### Проблема
Chrome не переносит уже открытый трек `'default'` на новое системное устройство. Пример: пользователь подключил AirPods, ОС сделала их входом по умолчанию, а трек продолжает писать со встроенного микрофона. UI при этом показывает «По умолчанию — AirPods» (у записи `'default'` в `enumerateDevices` сменились label и groupId).

### Repro
Chrome/macOS: микрофон включён в режиме «По умолчанию» → подключить BT-гарнитуру (ОС переключает вход) → `track.label` остаётся прежним → `microphoneController.switchDevice('default')` → трек не меняется.

### Последствия для приложений
Собеседники слышат не тот микрофон. Приложение отслеживает `groupId`/`label` записи `'default'` и переоткрывает трек через обходной путь (`app:.../device-watcher.ts`, `lastActive`).

### Решение
API:
```ts
switchDevice(deviceId: string | null, options?: { force?: boolean }): Promise<SwitchResult>
// и/или готовый метод:
microphoneController.reacquire(): Promise<SwitchResult>   // переоткрыть текущее устройство (config.deviceId) с сохранением mute/pipeline
// автоматизация (opt-in):
new Valm({ audio: { followSystemDefault: true } })
devicesController.onDefaultDeviceChanged((e: { kind: 'microphone' | 'speaker'; previous: MediaDeviceInfo | null; current: MediaDeviceInfo | null }) => void)
```
Реализация:
- Прокинуть `force` до `TrackManager.switchDevice`: при `force` пропускать проверку на `:226`. В контроллере при `force` вызывать `switchAudioDevice` напрямую, не полагаясь на событие конфига (закрывается правкой из #3).
- В `DevicesController` на `devicechange` сравнивать `groupId` (и `label`) записи `'default'` с предыдущим снимком. При изменении слать `onDefaultDeviceChanged`. Если `followSystemDefault` включён, `config.deviceId` пуст или `'default'`, а трек `live`, вызывать `reacquire()`.
- Ретрай уже есть в `replaceTrack`: новый трек получаем до остановки старого (для аудио это так, `:379` → `:392`), поэтому переоткрытие бесшовное.
- Для камеры `force` полезен для «переоткрыть после NotReadable», а `followSystemDefault` не нужен.

Обратная совместимость: всё новое и opt-in.

Тесты:
- `enable()` → `switchDevice('default', {force:true})` → `onTrackReplaced` вызван, id трека сменился.
- mock `enumerateDevices`: сменить `groupId` у записи `'default'` + `devicechange` → `onDefaultDeviceChanged` 1 раз. С `followSystemDefault` → `TRACK_REPLACED`.
- `force` сохраняет mute (вместе с #5).

---

## 5. `AudioTrackManager.replaceTrack` не сохраняет mute

**Вердикт: ПОДТВЕРЖДЕНО.** Уточнение: аудит пишет, что баг станет достижим, «если появится `toggleMute`», но в библиотеке `toggleMute` **уже есть** (`microphone.controller.ts:135-150`). То есть баг достижим через публичный API прямо сейчас.

### Код
- `audio-track-manager.service.ts:198-206` `mute()`: `track.enabled = false`, `isMuted = true`, VAD уничтожается.
- `audio-track-manager.service.ts:365-409` `replaceTrack()`: новый трек из gUM (`enabled = true`), `this.isMuted` не трогается (остаётся `true`), `initVAD(newTrack)` (`:400`) запускает VAD на «заглушённом» микрофоне. `wasMuted` отсутствует.
- Для сравнения видео: `video-track-manager.service.ts:403, 418, 425` сохраняет `wasMuted` и выставляет `enabled = false` на новом выходном треке.
- `acquireTrack` (`:342-344`) и `enable()` при существующем треке (`:125-130`) сбрасывают `isMuted = false`. Для `enable()` это ожидаемо, но поведение нигде не описано.

### Проблема
`toggleMute()` → `isMuted: true`, UI «микрофон выключен» → `switchDevice(other)` (или force/followSystemDefault из #4, или автопереключение приложения после отключения BT) → новый трек передаёт звук, а `state.isMuted` по-прежнему `true`.

Если аудио-граф включён (`setGain`/`onAudioData`/аудио-эффекты), публикуется выход графа (`getOutputTrack`, `:83-89`), а граф заново строится на новом сыром треке с `enabled = true`. Результат тот же: звук идёт.

### Repro
```js
await mic.enable(); await mic.toggleMute()            // state.isMuted === true, track.enabled === false
await mic.switchDevice(otherId); await new Promise(r => setTimeout(r, 500))   // из-за #3
mic.state.isMuted     // true
mic.getTrack().enabled // true  ← звук идёт
```

### Последствия для приложений
Приватность: пользователь уверен, что заглушён, а его слышат. Сейчас приложение не использует `toggleMute`, только hard `toggle`, поэтому не затронуто. Отдельный момент для приложений на mediasoup: `Producer.replaceTrack` при `disableTrackOnPause: true` выставляет `track.enabled = !paused`. Поэтому mute через valm без `producer.pause()` ломается и на стороне mediasoup. Это стоит описать в README (раздел «Интеграция с SFU»).

### Решение
```ts
private async replaceTrack(abortController?, deviceId?) {
  const wasMuted = this.isMuted
  ...
  const newTrack = tempStream.getAudioTracks()[0]
  newTrack.enabled = !wasMuted                 // до публикации и до старта графа
  ...
  if (!wasMuted) this.initVAD(newTrack)        // как в mute(): при mute VAD не работает
  await this.startPipelineIfEngaged()
  ...
}
```
- То же добавить в force/reacquire (#4) и в fallback (#2).
- Опционально: `STATE_CHANGED` и `TRACK_REPLACED` несут `isMuted`, чтобы потребителю не читать его отдельно.

Обратная совместимость: чистый bugfix.

Тесты:
- `enable → toggleMute → switchDevice(other)` → `getTrack().enabled === false`, `state.isMuted === true`, `isSpeaking === false`, VAD не шлёт громкость > 0.
- То же при включённом графе (`setGain(1)`): сырой трек `enabled === false`.
- `unmute` после смены → `enabled === true`, VAD работает.

---

## 6. `VideoTrackManager.replaceTrack` останавливает pipeline эффектов до `getUserMedia`

**Вердикт: ПОДТВЕРЖДЕНО.** Открытый вопрос аудита («что `frameOutput.dispose()` делает с треком») закрыт: **выходной трек останавливается**.

### Код
- `video-track-manager.service.ts:405-410`: `pipeline.stop()` вызывается **до** `getNewTrack()` → gUM.
- `effects/pipeline/video-processing-pipeline.service.ts:203-220`: `stop()` → `frameOutput.dispose()`.
- `effects/pipeline/frame/canvas-frame-output.ts:106-113`: `this.track.stop()` + остановка треков `captureStream`.
- `effects/pipeline/frame/insertable-frame-output.ts:82-89`: `generator.stop()` (`MediaStreamTrackGenerator` и есть выходной трек).
- Мобильный путь `replaceTrackMobile` (`:440-471`) устроен так же (`:445-447`), плюс N3.
- Для сравнения аудио сделано правильно: `audio-track-manager.service.ts:379` (gUM), и только потом `:389-394` (остановка графа и старого трека).

### Проблема
Эффект включён, producer отправляет выходной трек pipeline. `switchDevice(B)` → pipeline остановлен → **выходной трек остановлен** → gUM(B) падает (`NotReadableError`: камера занята в Windows, `OverconstrainedError`: отключена, `NotAllowedError`, или AbortError при вытеснении с последующим `disable()`). Дальше:
- `TRACK_REPLACED` не отправляется, у producer остаётся остановленный трек, и собеседники видят замёрзший последний кадр или чёрный экран.
- `this.track` по-прежнему живой сырой трек камеры A. `getOutputTrack()` теперь возвращает **сырой** трек (pipeline не запущен), но событие об этом никто не отправляет.
- Локальный `MediaStream` (`media-stream.service.ts`) содержит мёртвый выходной трек, локальное превью тоже чёрное.
- `EffectsController` считает эффект активным, а pipeline остановлен. Эффект пропал без события.
- `isEnabled` остаётся `true`, поэтому UI показывает «камера включена».

### Repro
Chrome/Windows: включить камеру A → включить blur → занять камеру B в другом приложении → `cameraController.switchDevice(B)` → reject `NotReadableError`. `cameraController.getTrack()` возвращает сырой A, а трек, который приложение отдало в producer, в состоянии `readyState === 'ended'`. Для воспроизведения в e2e: mock gUM с reject для `exact: 'busy'`.

### Последствия для приложений
Видео у всех участников замерзает после неудачной смены камеры с включённым эффектом. Восстановить может только повторный `switchDevice` или toggle камеры. Обойти это в приложении нельзя без знания внутренностей (разве что проверять `producer.track.readyState` после ошибки и вызывать `replaceTrack(camera.getTrack())`).

### Решение
Минимальный фикс (порядок как у аудио):
```ts
private async replaceTrack(abortController?, deviceId?) {
  const oldTrack = this.track
  const oldOutputTrack = this.getOutputTrack()
  const wasMuted = this.isMuted

  const newTrack = await this.getNewTrack(abortController, deviceId, false)   // 1. сначала gUM; при ошибке ничего не тронуто

  if (this.pipeline?.isRunning()) this.pipeline.stop()                        // 2. потом остановка
  oldTrack?.removeEventListener('ended', this.handleTrackEnded); oldTrack?.stop()
  this.track = newTrack; this.isMuted = wasMuted

  try { await this.pipeline?.start(newTrack) }                                // 3. N6: при ошибке графа
  catch (e) { this.emit(ERROR, e) }                                           //    отдаём сырой трек, но событие шлём
  const newOutputTrack = this.getOutputTrack()!
  if (wasMuted) newOutputTrack.enabled = false
  this.emit(TRACK_REPLACED, { track: newOutputTrack, oldTrack: oldOutputTrack ?? undefined, source: 'device' })
}
```
- Для мобильного пути (камера одна, gUM до stop невозможен): при ошибке gUM **восстановить** состояние: остановить pipeline, отправить `TRACK_REMOVED` для **выходного** трека, `isEnabled = false`, `STATE_CHANGED`, пробросить ошибку. Либо попытаться вернуть предыдущее устройство (`getNewTrack(prevDeviceId)`) и отправить `TRACK_REPLACED`. Лучше второе с fallback на первое (см. N3).
- Этап 2, отдельная задача: `pipeline.switchInput(newTrack)` без пересоздания `frameOutput`. Тогда выходной трек не меняется, `TRACK_REPLACED` для producer не нужен, смена камеры с эффектом бесшовная и без `replaceTrack` у SFU.

Обратная совместимость: bugfix, в успешном сценарии поведение не меняется.

Тесты:
- `enable` + `effects.addEffect(blur)` → запомнить `outputTrack` → mock gUM reject `NotReadableError` для B → `switchDevice(B)` reject → `outputTrack.readyState === 'live'`, `getTrack() === outputTrack`, `effects` активен, `state.isEnabled`.
- Успешная смена с эффектом → `onTrackReplaced` 1 раз, новый трек `live`, `source === 'device'`.
- mock `pipeline.start` reject после успешного gUM → `TRACK_REPLACED` с сырым треком + `onError`.
- Мобильный путь (UA mock): gUM reject → либо возврат на прежнее устройство, либо `TRACK_REMOVED` + `isEnabled === false`.

---

## 7. `AudioOutputController.setOutputDevice` молча игнорирует неизвестный id

**Вердикт: ПОДТВЕРЖДЕНО.** Такое поведение закреплено тестом `e2e/audio-output.spec.ts:96-107`, то есть сделано намеренно. В том же методе ещё три дефекта, [NEW].

### Код
- `core/media-stream/controllers/audio-output.controller.ts:34-39`: при неизвестном id и **непустом** кэше метод делает `return`: без ошибки, без события, промис резолвится.
- `:38`: при **пустом** кэше (например, `getAvailable()` ещё не вызывали) принимается любой id.
- [NEW] `:45` → `:47` → `:63`: `state.deviceId` меняется **до** применения, а `applyToRegisteredElements` использует `Promise.allSettled`, поэтому ошибки `setSinkId` проглатываются. `onChange` сообщает новое устройство, даже если ни один элемент не переключился.
- [NEW] `:47, :59`: для системного вывода в `setSinkId` передаётся строка `'default'`. По спецификации системный вывод задаётся `''`. Firefox и Safari не понимают `'default'` (в приложении это учтено: `app:.../device-options.ts:82`). В этих браузерах `setOutputDevice('default')` оставляет элементы на предыдущем выводе, а state показывает `'default'`.
- [NEW] `:30-32` `setAvailableDevices`: пропажу выбранного sink никак не обрабатывает. Chrome молча переключает звук на системный вывод, а state остаётся прежним. После повторного подключения обратно не переключается.
- `:21-22` `registerAudioElement`: ошибка `setSinkId` тоже проглатывается. `playTestSound` (`:135-137, :159-161`) при той же ошибке, наоборот, бросает исключение, то есть поведение непоследовательное.
- Мелочь: `autoSelectSpeakerphone` (`:66-77`) при отсутствии совпадения по label выбирает `availableDevices[0]`, то есть случайное устройство.

### Repro
- `await audioOutputController.setOutputDevice('stale-id')` (устройство отключили, UI не обновился) → резолвится, `getOutputState().deviceId` прежний, события нет.
- Firefox: выбрать реальный вывод → `setOutputDevice('default')` → звук остаётся на прежнем устройстве, state `'default'`.

### Последствия для приложений
Селектор не может показать ошибку, а UI расходится с реальностью. Приложение фактически обходит контроллер: `setSinkId` вызывается само (`app:modules/conference/components/audio-mixer/AudioPlayer.tsx:19-28`, `app:services/notification/NotificationService.ts:85-94`), а пропажу sink обрабатывает `reconcileSpeaker` (`app:.../device-watcher.ts:134+`).

### Решение
API:
```ts
setOutputDevice(deviceId: string | null): Promise<void>
// null | 'default' → системный вывод; reject NotFoundError при неизвестном id; reject, если setSinkId упал у всех элементов
interface AudioOutputState {
  deviceId: string                 // фактически применённый ('default' для системного)
  preferredDeviceId?: string | null // выбранный пользователем (для восстановления)
  isFallback?: boolean             // выбранный пропал, играем в системный
}
onError(cb) / onDeviceLost(cb)
```
Реализация:
- Если кэш пуст, сначала выполнить `enumerateDevices()` (тихо, без запроса разрешений) и только потом проверять id.
- Преобразование id для `setSinkId`: `const sink = (id === 'default' || id == null) ? '' : id` во всех местах (`registerAudioElement`, `apply…`, `playTestSound`).
- Сначала применить, потом зафиксировать: `const results = await allSettled(...)`. Если есть элементы и все отказали, откатить (`state` не меняется) и reject с первой ошибкой. Если отказала часть, зафиксировать state и отправить `onError` с перечнем. Элементов нет → state фиксируется сразу.
- В `setAvailableDevices` (или через `DevicesController` на `devicechange`): если `preferredDeviceId` пропал, применить `''`, выставить `isFallback = true` и отправить `onDeviceLost`. При повторном появлении вернуть устройство и отправить `onChange`.
- `autoSelectSpeakerphone`: без совпадения по label ничего не выбирать.

Обратная совместимость: reject вместо тихого резолва ломает поведение, закреплённое тестом `audio-output.spec.ts:96`. Варианты: (а) выпустить в minor как bugfix и явно отметить в changelog; (б) в 1.x возвращать `Promise<boolean>` (`false` = не применено) и отправлять `onError`, а reject ввести в 2.0. Рекомендую (б): его нельзя пропустить молча, и существующий `await` без `catch` ничего не ломает.

Тесты:
- Неизвестный id → `false`/reject, state не менялся, `onChange` не вызывался (обновить `audio-output.spec.ts:96`).
- Пустой кэш + неизвестный id → тот же результат (мок `enumerateDevices`).
- Зарегистрированный элемент с mock `setSinkId` → reject → state не меняется.
- `setOutputDevice('default')` → `setSinkId` вызван с `''`.
- Выбранный sink исчез из `enumerateDevices` + `devicechange` → `isFallback`, `onDeviceLost`; вернулся → восстановлен.

---

## 8. Нет событий `onmute`/`onunmute`

**Вердикт: ПОДТВЕРЖДЕНО, УТОЧНЕНО.**

### Код
- `grep -rn "'mute'\|'unmute'\|onmute\|onunmute" src/` не находит ни одного слушателя на `MediaStreamTrack`.
- Возможная путаница в именах: `MediaEvents.TRACK_MUTED`/`TRACK_UNMUTED` (`core/types/events.types.ts:7`) и `state.isMuted` означают **программный** mute valm (`track.enabled = false`), а не `track.muted` (источник не отдаёт данные).
- Уточнение: обход в приложении (`app:.../device-watcher.ts:236-273`) подписывается на `microphone.getTrack()`. Когда включён аудио-граф, это **выходной трек `MediaStreamAudioDestinationNode`** (`audio-track-manager.service.ts:83-89`). Такой трек не получает `mute`, даже если заглушён сырой источник. Значит, обход перестаёт работать, как только приложение вызывает `setGain`/`onAudioData`/подключает аудио-эффекты. Сырой трек наружу не отдаётся (`getRawTrack` есть только у менеджера, а он приватный). Поэтому исправить это можно только в библиотеке.

### Проблема
`track.muted = true` приходит при смене BT-профиля A2DP↔HFP, при системном mute (macOS/Windows), когда устройство захвачено другим приложением, при закрытой крышке ноутбука (камера), в iOS при прерывании (звонок). Валм при этом показывает «микрофон включён, говорим», а VAD даёт 0. Пользователь не понимает, почему его не слышно.

### Repro
Chrome/macOS: включить микрофон на BT-гарнитуре → включить в другом приложении вывод на ту же гарнитуру, чтобы профиль сменился → `track.muted === true`, `track.readyState === 'live'`. У valm нет ни события, ни поля state.

### Последствия для приложений
Нельзя показать «Микрофон не передаёт звук». Каждое приложение вынуждено вешать слушатели на трек само и следить за его заменой. При включённом графе и это невозможно.

### Решение
API (другие имена, чтобы не путать с `isMuted`):
```ts
interface MicrophoneState / CameraState {
  isSourceMuted: boolean        // = rawTrack.muted
}
microphoneController.onSourceMuteChange((e: { muted: boolean; track: MediaStreamTrack }) => void)
cameraController.onSourceMuteChange(...)
// MediaEvents.SOURCE_MUTED / SOURCE_UNMUTED  { kind: 'audio' | 'video', track }
```
Реализация:
- В `AudioTrackManager` и `VideoTrackManager` иметь один приватный метод `attachTrackListeners(track)`/`detachTrackListeners(track)`, который вызывается в `acquireTrack`, `replaceTrack`, `enableWithTrack`, а в `disable`/`handleTrackEnded` снимает слушатели. Туда же перенести `ended` (сейчас он навешивается в 4 местах по-разному: `audio-track-manager.service.ts:160, 346, 397`, `video-track-manager.service.ts:102, 380`, а в аудио слушатель вообще не снимается).
- Слушатели вешаются на **сырой** трек (`this.track`). Выходной трек графа или pipeline `mute` не получает.
- `emitStateIfChanged` учитывает `isSourceMuted`.
- Опционально: `sourceMuteDebounceMs` (по умолчанию 0). При смене профиля `mute`→`unmute` приходит за сотни миллисекунд, и приложение само решает, что показывать. В приложении задержка сейчас 3 с.
- Вместе с N2: событие `onTrackEnded({ reason })`.

Обратная совместимость: только добавления.

Тесты:
- `enable()` → на сыром треке `dispatchEvent(new Event('mute'))` (в Chromium `muted` read-only, поэтому state проверять через `Object.defineProperty(track, 'muted', {get: () => true})` + dispatch) → `onSourceMuteChange({muted:true})`, `state.isSourceMuted`.
- То же при включённом графе (`setGain(1)`): событие приходит.
- После `switchDevice` слушатели висят на новом треке, со старого сняты (dispatch на старый → событий нет).

---

## 9. Новые проблемы [NEW]

### N1 [P1]. После неудачной смены в конфиге остаётся битый `deviceId`
- `camera.controller.ts:130` и `microphone.controller.ts:223`: `setVideoDevice`/`setAudioDevice(deviceId)` вызывается **до** попытки. При ошибке (`catch` на `:134`/`:224` и `:68-70`) конфиг не откатывается.
- Последствие: одна неудачная смена (камера занята) → выключить/включить камеру → `enable()` пытается открыть занятую камеру через `exact` и падает, хотя прежняя работала. Приложение откатывает конфиг само (`app:.../device-selection.ts:116-119, 140-143`).
- Решение: откат в `catch` под флагом `isSwitchingDevice` (см. #3). В связке с fallback из #2.
- Тест: mock gUM reject → `switchDevice('bad')` → `getConfiguration().deviceId` прежний → `disable(); enable()` успешно.

### N2 [P2]. Пропажу устройства нельзя отличить от `disable()`
- `audio-track-manager.service.ts:462-475`, `video-track-manager.service.ts:474-503`: на `ended` менеджер отправляет тот же `TRACK_REMOVED` + `isEnabled = false`, что и `disable()`. При этом `config.enabled` остаётся `true` (его сбрасывает только `controller.disable()`), и state с конфигом расходятся.
- Приложение определяет «неожиданную остановку» по косвенному признаку `!state.isEnabled && config.enabled` (`app:.../device-watcher.ts:200-206`).
- Решение: `onTrackEnded((e: { kind; reason: 'device-lost' | 'ended'; deviceId; groupId; label }) => void)`. Причина `'device-lost'` ставится, если после `devicechange` устройства нет в списке. Опция `autoRecover: 'default'` для микрофона: переоткрыть системный вход (как Google Meet) и отправить `onDeviceFallback` из #2. В `handleTrackEnded` синхронизировать `config.enabled` или явно задокументировать, что это «намерение пользователя».
- Тест: `enable()` → `track.stop()` + `dispatchEvent(new Event('ended'))` → `onTrackEnded` вызван, `onStateChange({isEnabled:false})`.

### N3 [P2]. Мобильный `replaceTrackMobile` при ошибке оставляет несогласованное состояние
- `video-track-manager.service.ts:351-362`: при `stopOldTrackBefore` сначала `this.track = null` и `TRACK_REMOVED` с **сырым** `oldTrack` (`:358`). Когда pipeline включён, приложение и `MediaStream` держат выходной трек, поэтому `removeTrackFromStream` убирает не тот трек, а выходной остаётся в стриме мёртвым (pipeline уже остановлен на `:445-447`).
- Если после этого gUM падает (`:372`), то `track = null`, `isEnabled = true`, а `STATE_CHANGED` не отправляется (`runExclusive` пробрасывает ошибку до `emitStateIfChanged`, `:296-309`). UI показывает «камера включена», трека нет.
- Кроме того, `switchDevice` на мобильных (`:264-267`) не проверяет `isEnabled`/`isTrackActive` и при прямом вызове менеджера может «включить» выключенную камеру (через публичный `CameraController` это не достижимо, он проверяет `isEnabled`).
- Решение: отправлять `TRACK_REMOVED` с выходным треком. На ошибку gUM пробовать вернуть прежнее устройство, а если не вышло, то `isEnabled = false` + `STATE_CHANGED`. Проверять `isEnabled` до мобильной ветки.

### N4 [P3]. `MediaEvents.ERROR` уходит в `onError` обоих контроллеров
- `camera.controller.ts:38-40` и `microphone.controller.ts:39-41` подписаны на общий `MediaEvents.ERROR` с `source: 'camera/microphone'`, а фильтры в `_notifyError` пропускают это значение в обоих контроллерах. Ошибка аудио-менеджера (например, `enable` микрофона) придёт и в `camera.onError`.
- Последствие для приложения: `waitForTrackSwitch` камеры может reject-нуться из-за ошибки микрофона.
- Решение: в `MediaStreamService` отправлять `ERROR` с `kind: 'audio' | 'video'` и в контроллерах фильтровать по нему.

### N5 [P3]. Вытесненный `switchDevice` резолвится как успешный
- `audio-track-manager.service.ts:259-263`, `video-track-manager.service.ts:297-301`: `AbortError` проглатывается, и вызывающий получает `resolve`. `camera.switchDevice(A)`, вытесненный `switchDevice(B)`, выглядит для вызывающего как успешная смена на A.
- Решение: вернуть `{ applied: false, reason: 'superseded' }` (см. #3) или reject с `AbortError`. Первое совместимо.

### N6 [P3]. Ошибка `pipeline.start()` после подмены трека
- Видео `:417-421` и аудио `:392-401`: старый трек уже остановлен, `this.track` новый. Если `pipeline.start` бросает (WebGL/AudioContext), `TRACK_REPLACED` не отправляется, и producer остаётся на остановленном треке. Исправление описано в #6: `try/catch` вокруг `start`, отправка события с сырым треком + `onError`.

### N7 [P3]. Видео-mute теряется при включении или выключении эффекта
- `video-track-manager.service.ts:143-151`: `mute()` выключает только **выходной** трек. `suspendPipeline` (`:191-212`) возвращает сырой трек, у которого `enabled = true`. `resumePipeline` (`:215-244`) создаёт новый выходной трек, а `canvas-frame-output.ts:43` явно ставит ему `enabled = true`. `isMuted` остаётся `true`, а видео идёт.
- Через публичный API сейчас не достижимо: у `CameraController` нет mute, `mediaStreamService` приватный. Станет багом, как только появится `camera.toggleMute`.
- Решение: в `suspend`/`resume`, если `isMuted`, выставлять `newOutputTrack.enabled = false`. Лучше мьютить сырой трек, как у аудио.

### N8 [P3]. `microphone.enable(id)` при включённом микрофоне делает два переключения
- `microphone.controller.ts:95-97`: `setAudioDevice(id)` синхронно запускает `handleConfigurationChange` → `switchAudioDevice()` (не ожидается), затем `:102-103` вызывает `switchAudioDevice()` ещё раз. Второй вызов вытесняет первый через `runExclusive`: лишний gUM, а ошибка первого вызова уходит в `onError` с `action: 'configUpdate'`. Исправляется флагом `isSwitchingDevice` из #3.

### N9 [P3]. iOS-constraints: комментарий расходится с кодом
- `constraints-builder.service.ts:5, 24` обещают `ideal`, но `:30` ставит `deviceId: { exact }`. На iOS смена `deviceId` у камер одного устройства обычно работает, но при устаревшем id та же проблема, что в #2. Исправить комментарий или код в рамках #2.

---

## 10. Что проверить руками в браузере (не выводится из кода)

1. Chrome (macOS/Windows): `getSettings().deviceId` у трека, открытого без `deviceId`, равен `'default'`. На этом держатся #1 и #4. В аудите это наблюдалось, но в e2e не закреплено. Добавить smoke-тест с fake-devices.
2. Chrome/macOS: заканчивается ли трек на `'default'` (`ended`) при отключении BT-гарнитуры, которая была дефолтом, или он молча переезжает (AUDIT §6 п.14). От этого зависит, нужен ли `followSystemDefault` и на отключение, или только на подключение.
3. Порядок `ended` и `devicechange` при отключении USB/BT в Chrome, Firefox, Safari (нужен для N2 и дедупликации в #1).
4. Firefox/Safari: `setSinkId('')` и `setSinkId(id)` без `selectAudioOutput()` (#7).
