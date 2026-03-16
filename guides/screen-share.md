# ScreenShareController

Управление демонстрацией экрана: старт/стоп, настройка поверхности, разрешения, FPS, аудио.

## Доступ

```typescript
const screenShare = media.screenShareController;
```

---

## Действия

### Старт / стоп

```typescript
await screenShare.start()    // запустить демонстрацию (открывает системный диалог выбора)
screenShare.stop()           // остановить
await screenShare.toggle()   // переключить: если активна — стоп, иначе — старт
```

### Настройка перед запуском

```typescript
// updateDisplaySurface(surface: 'monitor' | 'window' | 'application')
screenShare.updateDisplaySurface('monitor')      // захват всего монитора
screenShare.updateDisplaySurface('window')       // захват конкретного окна
screenShare.updateDisplaySurface('application')  // захват приложения

// updateAudioIncluded(includeAudio: boolean)
screenShare.updateAudioIncluded(true)   // захватывать системный звук
screenShare.updateAudioIncluded(false)  // только видео

// updateMaxResolution(maxWidth?: number, maxHeight?: number)
screenShare.updateMaxResolution(1920, 1080)  // ограничить разрешение
screenShare.updateMaxResolution()            // убрать ограничение

// updateMaxFrameRate(maxFrameRate?: number)
screenShare.updateMaxFrameRate(30)   // ограничить до 30 FPS
screenShare.updateMaxFrameRate(60)   // ограничить до 60 FPS
screenShare.updateMaxFrameRate()     // убрать ограничение

// updateContentHint(contentHint: 'motion' | 'detail' | 'text' | '')
screenShare.updateContentHint('detail')  // презентации, документы — оптимизация чёткости
screenShare.updateContentHint('motion')  // видео, игры — оптимизация плавности
screenShare.updateContentHint('text')    // текстовые документы — максимальная чёткость текста
screenShare.updateContentHint('')        // без подсказки

// updateConstraints(constraints: Partial<ScreenShareConfiguration>)
// Обновить несколько параметров за раз
screenShare.updateConstraints({
  preferDisplaySurface: 'monitor',
  includeAudio: true,
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 30,
  contentHint: 'detail',
})
```

> Изменение параметров во время активного шаринга автоматически перезапускает демонстрацию с новыми настройками.

### Проверка поддержки (статический метод)

```typescript
const result = await ScreenShareController.checkCapabilities()
// {
//   supported: boolean                           // поддерживает ли браузер getDisplayMedia
//   capabilities?: MediaTrackSupportedConstraints // поддерживаемые video-constraints (если supported: true)
// }

if (!result.supported) {
  console.warn('Screen sharing not supported')
}
```

---

## Геттеры и состояние

```typescript
screenShare.state              // ScreenShareState — текущее состояние
screenShare.getStream()        // MediaStream | null — активный медиапоток
screenShare.getTrack()         // MediaStreamTrack | null — видеотрек потока
screenShare.getActiveSettings() // MediaTrackSettings | null — настройки активного трека
screenShare.getConfiguration() // ScreenShareConfiguration — текущая конфигурация
```

### `ScreenShareState`

```typescript
interface ScreenShareState {
  isActive: boolean          // демонстрация активна
  stream: MediaStream | null // активный медиапоток (null если не активна)
}
```

### `ScreenShareConfiguration`

```typescript
interface ScreenShareConfiguration {
  preferDisplaySurface: 'monitor' | 'window' | 'application' // тип захватываемой поверхности
  includeAudio: boolean       // захватывать системный звук
  maxWidth?: number           // максимальная ширина (undefined = без ограничений)
  maxHeight?: number          // максимальная высота (undefined = без ограничений)
  maxFrameRate?: number       // максимальная частота кадров (undefined = без ограничений)
  contentHint?: 'motion' | 'detail' | 'text' | '' // подсказка кодеку об оптимизации
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
const unsub = screenShare.onStateChange((state: ScreenShareState) => {
  // state.isActive: boolean — демонстрация активна
  // state.stream: MediaStream | null — текущий поток
  console.log('Active:', state.isActive)
  if (state.stream) {
    videoEl.srcObject = state.stream
  }
})

screenShare.onError((error: MediaErrorEvent) => {
  // error.source: 'screenShare'
  // error.action: 'start' | 'stop' | 'configUpdate' | undefined
  // error.error: unknown — оригинальная ошибка
  console.error(`Screen share error [${error.action}]:`, error.error)
})

unsub() // отписка
```

---

## Типичные сценарии

### Демонстрация презентации

```typescript
screenShare.updateContentHint('detail')
screenShare.updateDisplaySurface('window')
screenShare.updateMaxResolution(1920, 1080)
await screenShare.start()

videoEl.srcObject = screenShare.getStream()
```

### Захват игры / видео

```typescript
screenShare.updateContentHint('motion')
screenShare.updateMaxFrameRate(60)
screenShare.updateAudioIncluded(true)
await screenShare.start()
```

### Кнопка включения/выключения

```typescript
shareBtn.onclick = async () => {
  await screenShare.toggle()
  shareBtn.textContent = screenShare.state.isActive ? 'Остановить' : 'Поделиться экраном'
}
```

### Реакция на системную остановку (пользователь нажал «Стоп» в браузере)

```typescript
screenShare.onStateChange((state) => {
  if (!state.isActive) {
    // пользователь мог остановить шаринг через встроенный UI браузера
    shareBtn.textContent = 'Поделиться экраном'
  }
})
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `start()` | `Promise<void>` | Начать демонстрацию экрана |
| `stop()` | `void` | Остановить демонстрацию |
| `toggle()` | `Promise<void>` | Переключить старт/стоп |
| `updateDisplaySurface(s)` | `void` | Тип захватываемой поверхности |
| `updateAudioIncluded(b)` | `void` | Захватывать системный звук |
| `updateMaxResolution(w?, h?)` | `void` | Ограничить разрешение |
| `updateMaxFrameRate(fps?)` | `void` | Ограничить FPS |
| `updateContentHint(hint)` | `void` | Подсказка кодеку об оптимизации |
| `updateConstraints(opts)` | `void` | Обновить несколько параметров |
| `getConfiguration()` | `ScreenShareConfiguration` | Текущая конфигурация |
| `state` | `ScreenShareState` | Текущее состояние (геттер) |
| `getStream()` | `MediaStream \| null` | Активный медиапоток |
| `getTrack()` | `MediaStreamTrack \| null` | Видеотрек потока |
| `getActiveSettings()` | `MediaTrackSettings \| null` | Настройки активного трека |
| `checkCapabilities()` | `Promise<{ supported: boolean, capabilities?: MediaTrackSupportedConstraints }>` | Статический — проверка поддержки браузером |
| `onStateChange(cb)` | `VoidFunction` | Подписка на изменение `ScreenShareState` |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
