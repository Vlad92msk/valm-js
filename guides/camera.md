# CameraController

Управление видео-камерой: включение/выключение, переключение устройств, превью, получение трека.

## Доступ

```typescript
const camera = media.cameraController;
```

---

## Действия

### Включение / выключение

```typescript
await camera.enable()             // включить камеру
await camera.enable(deviceId)     // включить с конкретным устройством
camera.disable()                  // выключить
await camera.toggle()             // переключить состояние
await camera.reset()              // выключить (алиас для сброса)
camera.destroy()                  // уничтожить контроллер, снять все подписки
```

### Переключение устройства

```typescript
await camera.switchDevice(deviceId)   // переключить трек немедленно (если камера включена)
await camera.updateDevice(deviceId)   // обновить deviceId в конфигурации без переключения трека
await camera.toggleFacing()           // переключить между 'user' (фронтальная) и 'environment' (задняя)
```

### Превью

Отдельный трек для предварительного просмотра — не влияет на основной поток.

```typescript
const track = await camera.preview()           // создать превью-трек
const track = await camera.preview(deviceId)   // превью с конкретным устройством
previewVideo.srcObject = new MediaStream([track])

await camera.publishPreview()   // опубликовать превью как основной трек
camera.stopPreview()            // остановить превью без публикации
```

### Обновление конфигурации

```typescript
// updateResolution(width: number, height: number)
camera.updateResolution(1280, 720)
camera.updateResolution(1920, 1080)

// updateFrameRate(frameRate: number)
camera.updateFrameRate(30)
camera.updateFrameRate(60)

// updateConstraints(constraints: MediaTrackConstraints)
// Мёрджится с текущими constraints — передавай только то, что хочешь изменить
camera.updateConstraints({ aspectRatio: 16 / 9 })
camera.updateConstraints({ facingMode: 'environment' })
camera.updateConstraints({ width: { min: 640, ideal: 1280 }, frameRate: { max: 30 } })
```

---

## Геттеры и состояние

```typescript
camera.state                  // CameraState — текущее состояние
camera.getStream()            // MediaStream | null
camera.getTrack()             // MediaStreamTrack | null
camera.getConfiguration()     // VideoConfiguration
```

### `CameraState`

```typescript
interface CameraState {
  isEnabled: boolean                   // камера включена и трек активен
  isMuted: boolean                     // трек заглушён
  isPreviewing: boolean                // активен превью-трек
  hasDevice: boolean                   // обнаружено видеоустройство
  deviceId: string | null              // ID текущего устройства
  settings: MediaTrackSettings | null  // настройки активного трека
}
```

### `VideoConfiguration`

```typescript
interface VideoConfiguration {
  enabled: boolean
  deviceId: string | null
  resolution: { width: number; height: number }
  frameRate: number
  facingMode: 'user' | 'environment'
  constraints: MediaTrackConstraints
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
const unsub = camera.onStateChange((state: CameraState) => { ... })

camera.onError((error: MediaErrorEvent) => {
  // error.source: 'camera' | 'camera/microphone'
  // error.action: 'enable' | 'disable' | 'switch' | 'preview' | ...
  // error.error: unknown
})

camera.onTrackReplaced(({ oldTrack, newTrack, source }) => {
  // source: 'device' | 'background' | undefined
})

unsub() // отписка
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `enable(deviceId?)` | `Promise<void>` | Включить камеру |
| `disable()` | `void` | Выключить камеру |
| `toggle()` | `Promise<void>` | Переключить состояние |
| `reset()` | `Promise<void>` | Выключить камеру |
| `destroy()` | `void` | Уничтожить контроллер |
| `switchDevice(deviceId)` | `Promise<void>` | Переключить устройство и трек |
| `updateDevice(deviceId)` | `Promise<void>` | Обновить deviceId в конфигурации |
| `toggleFacing()` | `Promise<void>` | Фронтальная / задняя камера |
| `preview(deviceId?)` | `Promise<MediaStreamTrack>` | Создать превью-трек |
| `publishPreview()` | `Promise<void>` | Опубликовать превью в основной поток |
| `stopPreview()` | `void` | Остановить превью |
| `updateResolution(w, h)` | `void` | Изменить разрешение |
| `updateFrameRate(fps)` | `void` | Изменить частоту кадров |
| `updateConstraints(c)` | `void` | Установить дополнительные constraints |
| `state` | `CameraState` | Текущее состояние |
| `getStream()` | `MediaStream \| null` | Медиапоток |
| `getTrack()` | `MediaStreamTrack \| null` | Видеотрек |
| `getConfiguration()` | `VideoConfiguration` | Текущая конфигурация |
| `onStateChange(cb)` | `VoidFunction` | Подписка на `CameraState` |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
| `onTrackReplaced(cb)` | `VoidFunction` | Подписка на замену трека |
