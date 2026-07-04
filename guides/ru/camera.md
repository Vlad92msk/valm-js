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

## Снимок кадра

Статичный кадр с камеры. Если активен pipeline эффектов, кадр берётся **после**
обработки (с применённым blur / виртуальным фоном), иначе — с сырого трека.
Основной путь — `ImageCapture.grabFrame()`, фолбэк — отрисовка через `<video>`.

```typescript
// captureFrame(options?): Promise<Blob>
const blob = await camera.captureFrame()
const jpeg = await camera.captureFrame({ format: 'image/jpeg', quality: 0.85 })
const thumb = await camera.captureFrame({ width: 320 })   // downscale с сохранением пропорций

// captureFrameDataURL(options?): Promise<string>
const dataUrl = await camera.captureFrameDataURL()
avatarImg.src = dataUrl

// captureFrameToCanvas(canvas?): HTMLCanvasElement — синхронный, нативный размер трека
const canvas = camera.captureFrameToCanvas()
```

```typescript
interface CaptureFrameOptions {
  format?: 'image/png' | 'image/jpeg' | 'image/webp'  // по умолчанию 'image/png'
  quality?: number   // 0–1, для jpeg/webp
  width?: number     // downscale, по умолчанию — нативный размер трека
  height?: number
}
```

> `captureFrameToCanvas()` синхронный и требует уже готового кадра во внутреннем
> `<video>`. Первый вызов (или вызов сразу после смены трека) прогревает его и
> бросает ошибку «кадр ещё не готов» — повторный вызов сработает. Для одиночного
> снимка используйте асинхронный `captureFrame()`.

---

## Продвинутое управление (mobile)

Zoom / вспышка / фокус / экспозиция — применяются к физическому треку камеры.
Каждый метод — no-op с понятной ошибкой (через `onError`, `source: 'camera'`),
если возможность не поддерживается устройством.

```typescript
// Полные возможности трека
camera.getCapabilities()   // MediaTrackCapabilities | null (null если камера выключена)

// Zoom — значение клампится в диапазон capabilities
await camera.setZoom(2)

// Вспышка (torch)
await camera.toggleTorch()       // переключить
await camera.toggleTorch(true)   // включить принудительно

// Фокус и экспозиция
await camera.setFocusMode('continuous')     // 'continuous' | 'manual' | 'single-shot'
await camera.setExposureMode('continuous')  // 'continuous' | 'manual'

// Агрегированное состояние — удобно для рендеринга UI
const adv = camera.getAdvancedState()
if (adv.zoom.supported) {
  slider.min = adv.zoom.min; slider.max = adv.zoom.max; slider.step = adv.zoom.step
}
```

```typescript
interface AdvancedCameraState {
  zoom: { supported: boolean; min?: number; max?: number; step?: number; value?: number }
  torch: { supported: boolean; on: boolean }
  focus: { supported: boolean; mode?: string }
  exposure: { supported: boolean; mode?: string }
}
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
| `captureFrame(options?)` | `Promise<Blob>` | Снимок кадра как Blob |
| `captureFrameDataURL(options?)` | `Promise<string>` | Снимок кадра как data-URL |
| `captureFrameToCanvas(canvas?)` | `HTMLCanvasElement` | Синхронный снимок в canvas |
| `getCapabilities()` | `MediaTrackCapabilities \| null` | Возможности трека |
| `setZoom(value)` | `Promise<void>` | Zoom (клампится в диапазон) |
| `toggleTorch(on?)` | `Promise<void>` | Вспышка |
| `setFocusMode(mode)` | `Promise<void>` | Режим фокуса |
| `setExposureMode(mode)` | `Promise<void>` | Режим экспозиции |
| `getAdvancedState()` | `AdvancedCameraState` | Zoom/torch/focus/exposure |
| `state` | `CameraState` | Текущее состояние |
| `getStream()` | `MediaStream \| null` | Медиапоток |
| `getTrack()` | `MediaStreamTrack \| null` | Видеотрек |
| `getConfiguration()` | `VideoConfiguration` | Текущая конфигурация |
| `onStateChange(cb)` | `VoidFunction` | Подписка на `CameraState` |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
| `onTrackReplaced(cb)` | `VoidFunction` | Подписка на замену трека |
