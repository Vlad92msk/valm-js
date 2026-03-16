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
}
```

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

unsub();
```

### `DeviceDisconnectedEvent`

```typescript
interface DeviceDisconnectedEvent {
  kind: 'camera' | 'microphone'  // тип отключённого устройства
  deviceId: string               // ID отключённого устройства
}
```

Событие генерируется только для активных устройств — тех, что в данный момент используются камерой или микрофоном.

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
  await audioOutput.setOutputDevice('speaker-device-id');
}
```

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
```

### `AudioOutputState`

```typescript
interface AudioOutputState {
  deviceId: string  // ID выбранного устройства вывода или 'default'
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

// Переключение камеры
cameraSelect.onchange = () => media.cameraController.switchDevice(cameraSelect.value);

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
```

## API — DevicesController

| Метод | Возврат | Описание |
|-------|---------|----------|
| `getAvailable()` | `Promise<DevicesState>` | Список всех устройств |
| `checkPermissions()` | `Promise<{camera, microphone}>` | Проверить разрешения |
| `getCurrentAudioOutput(el)` | `string` | sinkId аудио-элемента или `'default'` |
| `onChange(cb)` | `VoidFunction` | Подписка на изменение списка |
| `onDeviceDisconnected(cb)` | `VoidFunction` | Подписка на отключение |
| `state` | `DevicesState` | Текущее состояние |

## API — AudioOutputController

| Метод | Возврат | Описание |
|-------|---------|----------|
| `setOutputDevice(deviceId)` | `Promise<void>` | Выбрать динамик |
| `registerAudioElement(el)` | `VoidFunction` | Зарегистрировать элемент |
| `playTestSound(opts?)` | `Promise<void>` | Воспроизвести тестовый звук |
| `autoSelectSpeakerphone()` | `Promise<boolean>` | Автовыбор динамика (мобильные) |
| `isOutputSelectionSupported()` | `boolean` | Поддержка setSinkId |
| `getOutputState()` | `AudioOutputState` | Состояние выхода |
| `onChange(cb)` | `VoidFunction` | Подписка на смену |
