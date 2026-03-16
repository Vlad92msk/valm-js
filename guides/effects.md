# EffectsController

Управление видео-эффектами: размытие фона, виртуальный фон, кастомные эффекты, качество обработки.

> Требует подключения `EffectsPlugin` через `module.use()`. Без плагина ML-зависимости (`@mediapipe/tasks-vision`) не загружаются.

## Доступ

```typescript
import { Valm, EffectsPlugin } from 'valm-js'

const media = new Valm(config)

// Подключить плагин — встроенные MediaPipe провайдеры
media.use(new EffectsPlugin())

// Или с кастомными ML-провайдерами вместо встроенных
media.use(new EffectsPlugin({
  providers: {
    segmentation: new MySegmentationProvider(), // заменяет встроенный MediaPipe segmentation
    faceMesh: new MyFaceMeshProvider(),          // заменяет встроенный MediaPipe face mesh
  }
}))

await media.initializeMedia()

const effects = media.effectsController
```

---

## Действия

### Размытие фона

```typescript
// enableBlur(params?: Partial<BackgroundBlurParams>)
await effects.enableBlur()                // включить с параметрами по умолчанию

await effects.enableBlur({
  intensity: 0.8,             // сила размытия: 0 (нет) — 1 (максимум), по умолчанию 0.7
  mode: BlurMode.BACKGROUND,  // BlurMode.BACKGROUND — размывает фон, BlurMode.FOREGROUND — размывает человека
  edgeSmoothing: true,        // сглаживание краёв маски
  smoothingThreshold: 0.5,    // порог сглаживания (0-1)
})

// setBlurIntensity(intensity: number)
effects.setBlurIntensity(0.5)   // значение зажимается в диапазон [0, 1]
effects.setBlurIntensity(1.0)   // максимальное размытие

// setBlurMode(mode: BlurMode)
effects.setBlurMode(BlurMode.BACKGROUND)   // размывает фон за человеком
effects.setBlurMode(BlurMode.FOREGROUND)   // размывает самого человека

// disableBlur() — выключает без удаления из pipeline
effects.disableBlur()

// toggleBlur() — включает если выключено, выключает если включено
await effects.toggleBlur()
```

### Виртуальный фон

```typescript
// setVirtualBackground(imageUrl: string)
await effects.setVirtualBackground('/backgrounds/office.jpg')
await effects.setVirtualBackground('https://cdn.example.com/bg.png')

// Блур и виртуальный фон конфликтуют:
// при вызове setVirtualBackground активный blur автоматически отключается

// setVirtualBackgroundColor(color: string) — цвет вместо изображения
effects.setVirtualBackgroundColor('#00AA00')   // CSS-цвет, любой формат
effects.setVirtualBackgroundColor('blue')
effects.setVirtualBackgroundColor('rgba(0,0,0,0.8)')

// setVirtualBackgroundFitMode(mode: BackgroundFitMode)
effects.setVirtualBackgroundFitMode(BackgroundFitMode.COVER)    // покрыть всю область, обрезая лишнее
effects.setVirtualBackgroundFitMode(BackgroundFitMode.CONTAIN)  // вместить целиком, добавив поля
effects.setVirtualBackgroundFitMode(BackgroundFitMode.STRETCH)  // растянуть на всю область
effects.setVirtualBackgroundFitMode(BackgroundFitMode.TILE)     // замостить повторением

// updateVirtualBackgroundParams(params: Partial<VirtualBackgroundParams>)
effects.updateVirtualBackgroundParams({
  imageUrl: '/backgrounds/beach.jpg',   // новое изображение
  fitMode: BackgroundFitMode.COVER,
  edgeSmoothing: true,        // сглаживание краёв
  smoothingThreshold: 0.5,    // порог сглаживания (0-1)
  edgeBlur: 2,                // радиус размытия краёв маски (пикселей)
})

// removeVirtualBackground() — выключает эффект без удаления из pipeline
effects.removeVirtualBackground()

// toggleVirtualBackground(imageUrl?: string)
await effects.toggleVirtualBackground('/backgrounds/office.jpg')  // включить с URL
await effects.toggleVirtualBackground()                           // выключить (если активен)
// Throws: если выключен и imageUrl не передан
```

### Качество и производительность

```typescript
// setQualityPreset(preset: QualityPreset)
effects.setQualityPreset('low')     // минимальная нагрузка, ниже качество
effects.setQualityPreset('medium')  // баланс качества и нагрузки (по умолчанию)
effects.setQualityPreset('high')    // высокое качество
effects.setQualityPreset('ultra')   // максимальное качество, высокая нагрузка
effects.setQualityPreset('custom')  // ручная настройка через setPerformanceConfig

// setPerformanceConfig(config: PerformanceConfig)
effects.setPerformanceConfig({
  preset: 'custom',        // 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  targetFps: 24,           // целевой FPS рендеринга
  mlFrameSkip: 2,          // ML-анализ каждый N-й кадр (1 = каждый, 2 = каждый второй)
  mlResolutionScale: 0.5,  // масштаб входного изображения для ML (1.0 = полное, 0.5 = половина)
  blurQuality: 15,         // радиус размытия, управляется pipeline через пресеты
})

// Быстрые методы — устанавливают preset: 'custom' и меняют один параметр
effects.setTargetFps(30)     // целевой FPS рендеринга
effects.setBlurQuality(20)   // радиус размытия
```

### Управление эффектами

```typescript
// addEffect(effect: IVideoEffect) — добавить кастомный эффект в pipeline
await effects.addEffect(myCustomEffect)

// removeEffect(name: string) — удалить эффект по имени
effects.removeEffect('my-custom-effect')
effects.removeEffect('background_blur')        // имя встроенного эффекта размытия
effects.removeEffect('virtual_background')     // имя встроенного эффекта виртуального фона

// getEffect<T>(name: string) — получить эффект по имени
const blur = effects.getEffect('background_blur')        // BackgroundBlurEffect | null
const myEffect = effects.getEffect<MyEffect>('my-effect') // T | null

// getEffects() — все эффекты в pipeline
const all = effects.getEffects()
// [{ name, type, requiredFeatures, isEnabled(), ... }, ...]

// disableAllEffects() — выключить все (не удаляет из pipeline, pipeline продолжает работать)
effects.disableAllEffects()

// stopProcessing() — удалить все эффекты из pipeline и полностью остановить обработку
effects.stopProcessing()
```

---

## Геттеры и состояние

```typescript
effects.state        // EffectsState — текущее состояние (геттер)

effects.getPipelineState()  // PipelineState | null — состояние pipeline обработки

effects.getBlurParams()               // BackgroundBlurParams | null — параметры размытия
effects.getVirtualBackgroundParams()  // VirtualBackgroundParams | null — параметры виртуального фона
effects.getPerformanceConfig()        // PerformanceConfig — текущие настройки производительности
```

### `EffectsState`

```typescript
interface EffectsState {
  isProcessingEnabled: boolean  // запущен ли pipeline видеообработки
  activeEffects: string[]       // имена активных (enabled) эффектов в pipeline
  currentFps: number            // текущий FPS pipeline (0 если не запущен)
  blur: {
    isEnabled: boolean  // включён ли эффект размытия
    intensity: number   // текущая интенсивность (0-1)
    mode: BlurMode      // BlurMode.BACKGROUND | BlurMode.FOREGROUND
  }
  virtualBackground: {
    isEnabled: boolean    // включён ли эффект виртуального фона
    image: string | null  // URL текущего изображения (null если используется цвет или не активен)
  }
  performance?: PerformanceConfig  // текущие настройки производительности (если pipeline запущен)
}
```

### `BackgroundBlurParams`

```typescript
interface BackgroundBlurParams {
  intensity: number         // сила размытия: 0 (нет) — 1 (максимум)
  mode: BlurMode            // BlurMode.BACKGROUND | BlurMode.FOREGROUND
  edgeSmoothing: boolean    // сглаживание краёв маски
  smoothingThreshold: number // порог сглаживания (0-1)
}
```

### `VirtualBackgroundParams`

```typescript
interface VirtualBackgroundParams {
  imageUrl: string | null      // URL изображения фона (null — используется backgroundColor)
  backgroundColor: string      // CSS-цвет фона (fallback или если imageUrl === null)
  fitMode: BackgroundFitMode   // режим масштабирования: COVER | CONTAIN | STRETCH | TILE
  edgeSmoothing: boolean       // сглаживание краёв маски
  smoothingThreshold: number   // порог сглаживания (0-1)
  edgeBlur: number             // радиус размытия краёв маски (пикселей, 0 = выключено)
}
```

### `PerformanceConfig`

```typescript
interface PerformanceConfig {
  preset?: QualityPreset      // 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  mlFrameSkip?: number        // ML-анализ каждый N-й кадр (1 = каждый, 2 = каждый второй)
  targetFps?: number          // целевой FPS рендеринга
  blurQuality?: number        // радиус размытия (управляется через пресеты или вручную)
  mlResolutionScale?: number  // масштаб входного изображения для ML (1.0 = полное, 0.5 = половина)
}
```

### `PipelineState`

```typescript
interface PipelineState {
  isRunning: boolean           // запущен ли pipeline
  currentFps: number           // текущий FPS обработки
  activeEffects: string[]      // имена активных эффектов
  gpuEnabled: boolean          // используется ли GPU-ускорение
  processorType?: 'canvas' | 'insertable-streams'  // тип процессора кадров
}
```

---

## Подписки

Каждая подписка возвращает функцию отписки.

```typescript
const unsub = effects.onStateChange((state: EffectsState) => {
  // state.isProcessingEnabled: boolean — pipeline запущен
  // state.activeEffects: string[]      — имена активных эффектов
  // state.currentFps: number           — текущий FPS
  // state.blur.isEnabled: boolean      — включено ли размытие
  // state.blur.intensity: number       — интенсивность размытия (0-1)
  // state.blur.mode: BlurMode          — режим размытия
  // state.virtualBackground.isEnabled: boolean  — включён ли виртуальный фон
  // state.virtualBackground.image: string | null — URL фона (null если нет)
  console.log('Effects state:', state.blur.isEnabled, state.currentFps)
})

effects.onError((error) => {
  // error.source: string    — источник ошибки ('effects')
  // error.action?: string   — действие, при котором произошла ошибка ('enableBlur', 'setVirtualBackground', ...)
  // error.error: unknown    — оригинальный объект ошибки
  console.error(`Effects error [${error.action}]:`, error.error)
})

unsub() // отписка
```

### События (TypedEventEmitter)

```typescript
import { EffectsEvents } from 'valm-js'

effects.on(EffectsEvents.STATE_CHANGED, (state: EffectsState) => { ... })
effects.on(EffectsEvents.EFFECT_ENABLED, ({ effect }: { effect: string }) => {
  console.log('Effect enabled:', effect)  // 'background_blur' | 'virtual_background' | имя кастомного
})
effects.on(EffectsEvents.EFFECT_DISABLED, ({ effect }: { effect: string }) => { ... })
effects.on(EffectsEvents.EFFECT_ADDED, ({ effect }: { effect: string }) => { ... })
effects.on(EffectsEvents.EFFECT_REMOVED, ({ effect }: { effect: string }) => { ... })
effects.on(EffectsEvents.PROCESSING_STARTED, () => { ... })
effects.on(EffectsEvents.PROCESSING_STOPPED, () => { ... })
effects.on(EffectsEvents.QUALITY_CHANGED, ({ preset }: { preset: QualityPreset }) => { ... })
effects.on(EffectsEvents.PERFORMANCE_CHANGED, (config: PerformanceConfig) => { ... })
effects.on(EffectsEvents.ERROR, (error: { source: string; action?: string; error: unknown }) => { ... })
```

---

## API

| Метод / геттер | Возврат | Описание |
|----------------|---------|----------|
| `enableBlur(params?)` | `Promise<void>` | Включить размытие фона |
| `disableBlur()` | `void` | Выключить размытие (без удаления из pipeline) |
| `toggleBlur()` | `Promise<void>` | Переключить размытие |
| `setBlurIntensity(n)` | `void` | Интенсивность размытия (0-1) |
| `setBlurMode(mode)` | `void` | Режим: BACKGROUND или FOREGROUND |
| `getBlurParams()` | `BackgroundBlurParams \| null` | Текущие параметры размытия |
| `setVirtualBackground(url)` | `Promise<void>` | Установить изображение фона |
| `removeVirtualBackground()` | `void` | Выключить виртуальный фон |
| `toggleVirtualBackground(url?)` | `Promise<void>` | Переключить виртуальный фон |
| `setVirtualBackgroundColor(c)` | `void` | CSS-цвет вместо изображения |
| `setVirtualBackgroundFitMode(m)` | `void` | Режим масштабирования фона |
| `updateVirtualBackgroundParams(p)` | `void` | Обновить несколько параметров |
| `getVirtualBackgroundParams()` | `VirtualBackgroundParams \| null` | Текущие параметры виртуального фона |
| `setQualityPreset(preset)` | `void` | Пресет качества |
| `setPerformanceConfig(config)` | `void` | Полная настройка производительности |
| `getPerformanceConfig()` | `PerformanceConfig` | Текущие настройки производительности |
| `setTargetFps(fps)` | `void` | Целевой FPS (устанавливает preset: 'custom') |
| `setBlurQuality(n)` | `void` | Радиус размытия (устанавливает preset: 'custom') |
| `addEffect(effect)` | `Promise<void>` | Добавить кастомный эффект в pipeline |
| `removeEffect(name)` | `void` | Удалить эффект по имени |
| `getEffect<T>(name)` | `T \| null` | Получить эффект по имени |
| `getEffects()` | `IVideoEffect[]` | Все эффекты в pipeline |
| `disableAllEffects()` | `void` | Выключить все эффекты (pipeline продолжает работать) |
| `stopProcessing()` | `void` | Удалить все эффекты и остановить pipeline |
| `state` | `EffectsState` | Текущее состояние (геттер) |
| `getPipelineState()` | `PipelineState \| null` | Состояние pipeline |
| `onStateChange(cb)` | `VoidFunction` | Подписка на изменение состояния |
| `onError(cb)` | `VoidFunction` | Подписка на ошибки |
