# DevicesController & AudioOutputController

Управление списком устройств, выбор динамика, обработка отключения устройств.

## DevicesController

### Доступ

```typescript
const devices = media.devicesController;
```

### Получение списка устройств

```typescript
const available = await devices.getAvailable();

available.cameras.forEach(cam => {
  const option = new Option(cam.label, cam.deviceId);
  cameraSelect.add(option);
});
```

### `DevicesState`

```typescript
interface DevicesState {
  cameras: MediaDeviceInfo[]      // видеоустройства
  microphones: MediaDeviceInfo[]  // аудиовходы
  speakers: MediaDeviceInfo[]     // аудиовыходы
  // Виртуальные записи 'default' (Chrome); в массивах выше их нет
  defaults: {
    microphone: MediaDeviceInfo | null           // «По умолчанию — <устройство>»
    speaker: MediaDeviceInfo | null
    communicationsMicrophone: MediaDeviceInfo | null  // 'communications' (Windows)
  }
}
```

`defaults.microphone.label` удобно показывать в селекторе как пункт «По умолчанию — AirPods».

`MediaDeviceInfo` — стандартный браузерный тип: `deviceId`, `label`, `kind`, `groupId`.

### Проверка разрешений

```typescript
const perms = await devices.checkPermissions();
// { camera: 'granted' | 'denied' | 'prompt', microphone: ... }
```

### Текущий sink аудио-элемента

```typescript
// getCurrentAudioOutput(audioElement: HTMLAudioElement)
const sinkId = devices.getCurrentAudioOutput(audioElement);
// Возвращает sinkId элемента или 'default'
```

### Состояние

```typescript
const state = devices.state;
// { cameras[], microphones[], speakers[] }
```

### Подписки

```typescript
// Изменение списка устройств (подключение/отключение)
const unsub = devices.onChange((state: DevicesState) => {
  rebuildDeviceList(state);
});

devices.onDeviceDisconnected(({ kind, deviceId }: DeviceDisconnectedEvent) => {
  console.warn(`${kind} disconnected: ${deviceId}`);
});

// ОС сменила системный вход/выход (например, подключили AirPods)
devices.onDefaultDeviceChanged(({ kind, previous, current }: DefaultDeviceChangedEvent) => {
  console.log(`${kind}: ${previous?.label} → ${current?.label}`);
});

unsub();
```

### `DeviceDisconnectedEvent`

```typescript
interface DeviceDisconnectedEvent {
  kind: 'camera' | 'microphone'  // тип отключённого устройства
  deviceId: string               // ID отключённого устройства
}
```

Событие приходит только на `devicechange` для устройства, которое последним открывали камера или микрофон, в том числе если его трек уже завершился. Один раз на переход «есть → нет». Виртуальный `'default'` не проверяется: о его смене сообщает `onDefaultDeviceChanged` (а микрофон может следовать за ней сам при `audio.followSystemDefault: true`). Вызов `getAvailable()` событие не генерирует.

---

## AudioOutputController

Управление выходным аудио-устройством (динамик/наушники).

### Доступ

```typescript
const audioOutput = media.audioOutputController;
```

### Выбор динамика

```typescript
// Проверить поддержку
if (audioOutput.isOutputSelectionSupported()) {
  const applied = await audioOutput.setOutputDevice('speaker-device-id');
  if (!applied) showError('Динамик недоступен'); // подробности в onError
}

// Системный вывод: null или 'default' (в setSinkId уходит '' — работает и в Firefox/Safari)
await audioOutput.setOutputDevice(null);
```

`setOutputDevice` возвращает `false` и не меняет состояние, если id неизвестен (при пустом списке он тихо запрашивается) или `setSinkId` отказал у всех зарегистрированных элементов.

### Регистрация аудио-элементов

Все зарегистрированные элементы автоматически переключаются при смене выходного устройства:

```typescript
const unregister = audioOutput.registerAudioElement(audioElement);

// Или видео-элемент
const unregister2 = audioOutput.registerAudioElement(videoElement);

// Отменить регистрацию
unregister();
```

### Тестовый звук

```typescript
// Синусоида 440Hz
await audioOutput.playTestSound();

// Или свой файл
await audioOutput.playTestSound({
  url: '/sounds/test-tone.mp3',
  duration: 3, // секунды, по умолчанию 2
});
```

### Автовыбор динамика (мобильные)

```typescript
const success = await audioOutput.autoSelectSpeakerphone();
```

### Подписка

```typescript
audioOutput.onChange((state: AudioOutputState) => {
  console.log('Output device:', state.deviceId);
});

audioOutput.onError(({ action, deviceId, error }) => { /* setOutputDevice / registerAudioElement */ });

// Выбранный вывод пропал: звук идёт в системный, пока устройство не вернётся
audioOutput.onDeviceLost(({ deviceId }) => { /* state.isFallback === true */ });
```

### `AudioOutputState`

```typescript
interface AudioOutputState {
  deviceId: string                 // фактически применённый вывод или 'default'
  preferredDeviceId: string | null // выбор пользователя (сохраняется, пока устройство отключено)
  isFallback: boolean              // выбранный вывод пропал, звук идёт в системный
}
```

`onChange` немедленно вызывает коллбэк с текущим состоянием при подписке.

---

## Типичные сценарии

### Настройки устройств перед звонком

```typescript
const { cameras, microphones, speakers } = await devices.getAvailable();

// Заполнить селекты
cameras.forEach(d => cameraSelect.add(new Option(d.label, d.deviceId)));
microphones.forEach(d => micSelect.add(new Option(d.label, d.deviceId)));
speakers.forEach(d => speakerSelect.add(new Option(d.label, d.deviceId)));

// Переключение камеры: промис резолвится после реальной замены трека, при ошибке — reject
cameraSelect.onchange = async () => {
  try {
    await media.cameraController.switchDevice(cameraSelect.value);
  } catch (e) {
    cameraSelect.value = media.cameraController.getConfiguration().deviceId ?? ''; // конфиг откатан
  }
};

// Переключение микрофона
micSelect.onchange = () => media.microphoneController.switchDevice(micSelect.value);

// Переключение динамика
speakerSelect.onchange = () => audioOutput.setOutputDevice(speakerSelect.value);

// Тест динамика
testBtn.onclick = () => audioOutput.playTestSound();
```

### Обработка отключения устройства

```typescript
devices.onDeviceDisconnected(({ kind, deviceId }) => {
  showNotification(`${kind === 'camera' ? 'Камера' : 'Микрофон'} отключена`);

  // Автопереключение на другое устройство
  if (kind === 'camera' && devices.state.cameras.length > 0) {
    media.cameraController.switchDevice(devices.state.cameras[0].deviceId);
  }
});

// Или доверить это Valm: открыть системное устройство, если выбранного нет,
// и вернуться на него, когда его снова подключат
const media = new Valm({
  audio: { deviceFallback: 'default' },
  video: { deviceFallback: 'default' },
});
media.microphoneController.onDeviceFallback(({ requestedDeviceId, actualDeviceId, reason }) => {
  showNotification('Выбранный микрофон недоступен, используется микрофон по умолчанию');
});
```

## API — DevicesController

| Метод | Возврат | Описание |
|-------|---------|----------|
| `getAvailable()` | `Promise<DevicesState>` | Список всех устройств |
| `checkPermissions()` | `Promise<{camera, microphone}>` | Проверить разрешения |
| `getCurrentAudioOutput(el)` | `string` | sinkId аудио-элемента или `'default'` |
| `onChange(cb)` | `VoidFunction` | Подписка на изменение списка |
| `onDeviceDisconnected(cb)` | `VoidFunction` | Подписка на отключение |
| `onDefaultDeviceChanged(cb)` | `VoidFunction` | ОС сменила системный микрофон/динамик |
| `state` | `DevicesState` | Текущее состояние |

## API — AudioOutputController

| Метод | Возврат | Описание |
|-------|---------|----------|
| `setOutputDevice(deviceId)` | `Promise<boolean>` | Выбрать динамик (`null`/`'default'` — системный); `false`, если не применено |
| `registerAudioElement(el)` | `VoidFunction` | Зарегистрировать элемент |
| `playTestSound(opts?)` | `Promise<void>` | Воспроизвести тестовый звук |
| `autoSelectSpeakerphone()` | `Promise<boolean>` | Автовыбор динамика (мобильные) |
| `isOutputSelectionSupported()` | `boolean` | Поддержка setSinkId |
| `getOutputState()` | `AudioOutputState` | Состояние выхода |
| `onChange(cb)` | `VoidFunction` | Подписка на смену |
| `onError(cb)` | `VoidFunction` | Ошибки выбора вывода |
| `onDeviceLost(cb)` | `VoidFunction` | Выбранный вывод пропал |
