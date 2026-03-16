# MicrophoneController

Управление микрофоном: включение/выключение, мягкий mute, переключение устройств, аудио-обработка, детекция голоса, превью.

## Доступ

```typescript
const mic = media.microphoneController;
```

---

## Действия

### Включение / выключение

```typescript
await mic.enable()             // включить микрофон
await mic.enable(deviceId)     // включить с конкретным устройством
mic.disable()                  // выключить (полностью останавливает трек)
await mic.toggle()             // переключить состояние (enable ↔ disable)
await mic.reset()              // выключить микрофон (если был включён)
mic.destroy()                  // уничтожить контроллер, снять все подписки
```

### Mute / Unmute

В отличие от `disable()`, мягкий mute сохраняет трек активным, но заглушает звук:

```typescript
await mic.toggleMute()   // mute ↔ unmute (трек остаётся, но track.enabled = false)
```

### Переключение устройства

```typescript
await mic.switchDevice(deviceId)    // обновить deviceId в конфигурации
await mic.updateDevice(deviceId)    // то же самое — алиас
```

### Аудио-обработка

```typescript
// updateAudioProcessing(options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean })
await mic.updateAudioProcessing({ echoCancellation: true })
await mic.updateAudioProcessing({ noiseSuppression: false, autoGainControl: true })
await mic.updateAudioProcessing({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })

// updateVolumeThreshold(threshold: number)
mic.updateVolumeThreshold(15)   // порог детекции речи, 0–100
mic.updateVolumeThreshold(30)
```

### Превью

Отдельный трек для предварительного просмотра — не влияет на основной поток.

```typescript
const track = await mic.preview()           // создать превью-трек
const track = await mic.preview(deviceId)   // превью с конкретным устройством

await mic.publishPreview()   // опубликовать превью как основной трек
mic.stopPreview()            // остановить превью без публикации
```

---

## Геттеры и состояние

```typescript
mic.state               // MicrophoneState — текущее состояние
mic.getStream()         // MediaStream | null
mic.getTrack()          // MediaStreamTrack | null
mic.getConfiguration()  // AudioConfiguration
```

### `MicrophoneState`

```typescript
interface MicrophoneState {
  isEnabled: boolean                   // микрофон включён и трек активен
  isMuted: boolean                     // трек заглушён (mute)
  isPreviewing: boolean                // активен превью-трек
  hasDevice: boolean                   // обнаружено аудиоустройство
  deviceId: string | null              // ID текущего устройства
  settings: MediaTrackSettings | null  // настройки активного трека
  volume: number                       // текущий уровень громкости (0–100)
  isSpeaking: boolean                  // говорит ли пользователь
}
```

### `AudioConfiguration`

```typescript
interface AudioConfiguration {
  enabled: boolean
  deviceId: string | null
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  enableSpeakingDetection: boolean
  volumeThreshold: number              // порог детекции речи (0–100)
  constraints: MediaTrackConstraints
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
const unsub = mic.onStateChange((state: MicrophoneState) => { ... })

mic.onVolumeChange(({ volume, isSpeaking }: VolumeChangeEvent) => {
  // volume: number      — текущий уровень (0–100)
  // isSpeaking: boolean — говорит ли пользователь
})

mic.onError((error: MediaErrorEvent) => {
  // error.source: 'microphone' | 'camera/microphone'
  // error.action: 'enable' | 'disable' | 'switch' | 'preview' | 'configUpdate' | ...
  // error.error: unknown
})

mic.onTrackReplaced(({ oldTrack, newTrack }) => {
  // oldTrack: MediaStreamTrack
  // newTrack: MediaStreamTrack
})

unsub() // отписка
```

---

## Типичные сценарии

### Видеозвонок с индикатором громкости

```typescript
await mic.enable();

mic.onVolumeChange(({ volume, isSpeaking }) => {
  volumeMeter.value = volume;
  avatar.classList.toggle('speaking', isSpeaking);
});

// Mute при нажатии кнопки
muteBtn.onclick = () => mic.toggleMute();
```

### Проверка микрофона перед звонком

```typescript
const track = await mic.preview();
previewAudio.srcObject = new MediaStream([track]);

mic.onVolumeChange(({ volume }) => {
  previewMeter.value = volume;
});

// Пользователь подтвердил
await mic.publishPreview();
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `enable(deviceId?)` | `Promise<void>` | Включить микрофон |
| `disable()` | `void` | Выключить (останавливает трек) |
| `toggle()` | `Promise<void>` | Переключить вкл/выкл |
| `toggleMute()` | `Promise<void>` | Мягкий mute/unmute |
| `reset()` | `Promise<void>` | Выключить (если был включён) |
| `destroy()` | `void` | Уничтожить контроллер |
| `switchDevice(deviceId)` | `Promise<void>` | Обновить устройство в конфигурации |
| `updateDevice(deviceId)` | `Promise<void>` | Обновить устройство в конфигурации |
| `updateAudioProcessing(opts)` | `Promise<void>` | Настроить аудио-обработку |
| `updateVolumeThreshold(n)` | `void` | Порог детекции речи (0–100) |
| `preview(deviceId?)` | `Promise<MediaStreamTrack>` | Создать превью-трек |
| `publishPreview()` | `Promise<void>` | Опубликовать превью в основной поток |
| `stopPreview()` | `void` | Остановить превью |
| `state` | `MicrophoneState` | Текущее состояние |
| `getStream()` | `MediaStream \| null` | Медиапоток |
| `getTrack()` | `MediaStreamTrack \| null` | Аудиотрек |
| `getConfiguration()` | `AudioConfiguration` | Текущая конфигурация |
| `onStateChange(cb)` | `VoidFunction` | Подписка на `MicrophoneState` |
| `onVolumeChange(cb)` | `VoidFunction` | Подписка на уровень громкости |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
| `onTrackReplaced(cb)` | `VoidFunction` | Подписка на замену трека |
