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
const result = await mic.switchDevice(deviceId)  // резолвится после реальной замены трека
// result: { applied: boolean, deviceId, reason?: 'noop' | 'superseded' | 'disabled' }
await mic.switchDevice(null)                     // системный микрофон
await mic.reacquire()                            // переоткрыть текущее устройство (например, 'default' после смены входа в ОС)
await mic.updateDevice(deviceId)                 // только обновить конфигурацию, ошибки уйдут в onError
```

`switchDevice` отклоняется, если новое устройство не открылось; прежний трек при этом продолжает работать, а `deviceId` в конфигурации откатывается. Мягкий mute переживает смену. При выключенном микрофоне меняется только конфигурация (`reason: 'disabled'`). Вызов, вытесненный более новым `switchDevice`, резолвится с `reason: 'superseded'`.

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
  isSourceMuted: boolean               // источник не отдаёт звук (track.muted: смена BT-профиля,
                                       // системный mute); в отличие от isMuted, Valm им не управляет
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
  deviceFallback?: 'none' | 'default'  // выбранного микрофона нет: 'none' — ошибка (по умолчанию), 'default' — открыть системный
  followSystemDefault?: boolean        // в режиме «По умолчанию» переоткрывать трек, когда ОС меняет системный вход
  sourceMuteDebounceMs?: number        // задержка перед onSourceMuteChange({ muted: true }); короткие «мигания» не сообщаются (по умолчанию 0)
}
```

При `deviceFallback: 'default'` выбранный `deviceId` остаётся в конфигурации: Valm вернётся на него, когда устройство снова подключат. Если активный микрофон пропал во время работы, Valm откроет системный (`onDeviceFallback` с `reason: 'device-lost'`).

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

mic.onTrackReplaced(({ oldTrack, newTrack, isMuted }) => {
  // oldTrack: MediaStreamTrack
  // newTrack: MediaStreamTrack
  // isMuted: boolean — мягкий mute уже применён к newTrack
})

// Источник перестал/начал отдавать звук (работает и при включённом аудио-графе)
mic.onSourceMuteChange(({ muted, track }) => showWarning(muted ? 'Микрофон не передаёт звук' : null))

// Трек завершился не по disable(): reason 'device-lost' | 'ended'
mic.onTrackEnded(({ reason, deviceId, label }) => { ... })

// Выбранного микрофона нет, открыт системный (deviceFallback: 'default')
mic.onDeviceFallback(({ requestedDeviceId, actualDeviceId, reason }) => { ... })

unsub() // отписка
```

---

## Аудио-обработка

Софтверный gain (сверх браузерного AGC) и данные визуализации. Работают через
лёгкий Web Audio граф. При первом использовании граф включается: публикуемый
аудио-трек заменяется на обработанный — подписчики `onTrackReplaced` получат
новый трек. ML-шумоподавление подключается отдельно, см.
[audio-effects.md](./audio-effects.md).

```typescript
// Громкость: множитель, 1.0 = без изменений
mic.setGain(1.5)
mic.getGain()          // 1.5

// Данные визуализации текущего кадра
mic.getFrequencyData()  // Uint8Array — спектр (пустой массив пока граф не активен)
mic.getWaveformData()   // Uint8Array — временная форма сигнала

// Поток данных на каждый кадр (для рисования эквалайзера / осциллографа)
const unsub = mic.onAudioData(({ frequency, waveform }) => {
  drawSpectrum(frequency)   // frequency.length === 1024
  drawWaveform(waveform)    // waveform.length === 2048
})
```

> `getFrequencyData()` / `getWaveformData()` синхронны и вернут пустой массив,
> пока граф не активен. Он включается после `setGain()`, `onAudioData()` или
> подключения `AudioEffectsPlugin`.

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
| `switchDevice(deviceId, opts?)` | `Promise<SwitchResult>` | Сменить устройство и дождаться нового трека; `opts.force` переоткрывает то же устройство |
| `reacquire()` | `Promise<SwitchResult>` | Переоткрыть текущее устройство |
| `updateDevice(deviceId)` | `Promise<void>` | Обновить устройство в конфигурации |
| `updateAudioProcessing(opts)` | `Promise<void>` | Настроить аудио-обработку |
| `updateVolumeThreshold(n)` | `void` | Порог детекции речи (0–100) |
| `setGain(value)` | `void` | Софтверный множитель громкости (1.0 = без изменений) |
| `getGain()` | `number` | Текущий множитель громкости |
| `getFrequencyData()` | `Uint8Array` | Спектр текущего кадра |
| `getWaveformData()` | `Uint8Array` | Временная форма сигнала |
| `onAudioData(cb)` | `VoidFunction` | Поток `{ frequency, waveform }` покадрово |
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
| `onSourceMuteChange(cb)` | `VoidFunction` | Источник заглушён/ожил (`track.muted`) |
| `onTrackEnded(cb)` | `VoidFunction` | Трек завершился не по `disable()` |
| `onDeviceFallback(cb)` | `VoidFunction` | Открыто системное устройство вместо выбранного |
