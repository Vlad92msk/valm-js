# Создание кастомных эффектов

Руководство по созданию собственных видео-эффектов: от простых фильтров до эффектов с ML.

## Архитектура эффектов

Каждый эффект реализует интерфейс `IVideoEffect`. Для удобства предоставлен базовый класс `BaseEffect`.

### IVideoEffect

```typescript
interface IVideoEffect<TParams = unknown> {
  readonly name: string               // уникальный идентификатор — используется в getEffect() / removeEffect()
  readonly type: EffectType           // категория эффекта
  readonly requiredFeatures: EffectFeature[]  // какие ML-данные нужны в FrameContext

  initialize(): Promise<void>         // вызывается один раз при addEffect()
  apply(ctx: FrameContext): void      // вызывается синхронно каждый кадр — все ML-данные уже готовы в ctx
  updateParams(params: Partial<TParams>): void
  getParams(): TParams
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  dispose(): void                     // освободить ресурсы при removeEffect()
}
```

### EffectType

```typescript
enum EffectType {
  BACKGROUND_BLUR = 'background_blur',
  VIRTUAL_BACKGROUND = 'virtual_background',
  FACE_MASK = 'face_mask',
  BEAUTY_FILTER = 'beauty_filter',
  COLOR_FILTER = 'color_filter',
}
```

### EffectFeature

```typescript
enum EffectFeature {
  SEGMENTATION = 'segmentation',  // маска фон/человек — будет доступна в ctx.segmentation и ctx.segmentationMask
  FACE_MESH = 'faceMesh',         // 478 точек лица — будет доступна в ctx.faceMesh
}
```

Если эффект объявляет `requiredFeatures`, pipeline автоматически запускает нужные ML-провайдеры и передаёт результаты в `FrameContext`. Провайдеры запускаются лениво при первом `addEffect` и освобождаются когда ни один эффект их не требует.

---

## BaseEffect

Базовый класс с управлением параметрами и жизненным циклом:

```typescript
import { BaseEffect, EffectType, EffectFeature, FrameContext } from 'valm-js'

class MyEffect extends BaseEffect<MyParams> {
  readonly name = 'my-effect'           // уникальный идентификатор
  readonly type = EffectType.COLOR_FILTER
  readonly requiredFeatures: EffectFeature[] = []

  constructor() {
    super({ /* параметры по умолчанию */ })
  }

  apply(ctx: FrameContext): void {
    // Читаем из ctx.sourceCanvas, пишем в ctx.outputCanvas
  }

  // Опционально: вызывается после updateParams()
  protected onParamsUpdated(): void {
    // Реакция на смену параметров
  }
}
```

---

## FrameContext

Каждый вызов `apply()` получает контекст текущего кадра:

```typescript
interface FrameContext {
  sourceCanvas: HTMLCanvasElement      // входной canvas с оригинальным кадром (read-only)
  sourceCtx: CanvasRenderingContext2D  // 2d context sourceCanvas
  outputCanvas: HTMLCanvasElement      // выходной canvas — сюда нужно записать результат
  outputCtx: CanvasRenderingContext2D  // 2d context outputCanvas
  width: number    // ширина кадра в пикселях
  height: number   // высота кадра в пикселях
  timestamp: number  // performance.now() — время кадра

  // Доступны если requiredFeatures включает SEGMENTATION:
  segmentation?: {
    maskData: Uint8Array  // 0 = человек (foreground), 255 = фон (background)
    width: number         // ширина маски (может отличаться от размера кадра)
    height: number        // высота маски
    timestamp: number
  }
  segmentationMask?: Uint8Array  // maskData, масштабированная под размер кадра (width * height пикселей)

  // Доступны если requiredFeatures включает FACE_MESH:
  faceMesh?: {
    landmarks: FaceLandmark[] | null  // 478 точек лица (normalized 0–1), null если лицо не найдено
    transformationMatrix: number[] | null  // 4×4 матрица трансформации — flat array из 16 чисел, для 3D-эффектов
    timestamp: number
  }
}

// Одна точка лица:
interface FaceLandmark {
  x: number   // 0–1 по ширине кадра
  y: number   // 0–1 по высоте кадра
  z?: number  // глубина (не всегда доступна)
}
```

---

## Примеры

### Простой цветовой фильтр (без ML)

```typescript
interface SepiaParams {
  intensity: number // 0–1
}

class SepiaEffect extends BaseEffect<SepiaParams> {
  readonly name = 'sepia'
  readonly type = EffectType.COLOR_FILTER
  readonly requiredFeatures: EffectFeature[] = []

  constructor() {
    super({ intensity: 1.0 })
  }

  apply(ctx: FrameContext): void {
    const { sourceCtx, outputCtx, width, height } = ctx
    const imageData = sourceCtx.getImageData(0, 0, width, height)
    const data = imageData.data
    const intensity = this.getParams().intensity

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]

      const sepiaR = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189)
      const sepiaG = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168)
      const sepiaB = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131)

      data[i]     = r + (sepiaR - r) * intensity
      data[i + 1] = g + (sepiaG - g) * intensity
      data[i + 2] = b + (sepiaB - b) * intensity
    }

    outputCtx.putImageData(imageData, 0, 0)
  }
}
```

### Эффект с сегментацией

```typescript
interface HighlightParams {
  opacity: number  // 0–1
}

class BackgroundHighlightEffect extends BaseEffect<HighlightParams> {
  readonly name = 'background-highlight'
  readonly type = EffectType.BACKGROUND_BLUR
  readonly requiredFeatures = [EffectFeature.SEGMENTATION]

  constructor() {
    super({ opacity: 0.5 })
  }

  apply(ctx: FrameContext): void {
    const { sourceCanvas, outputCtx, width, height, segmentationMask } = ctx
    if (!segmentationMask) return

    // Копируем оригинальный кадр
    outputCtx.drawImage(sourceCanvas, 0, 0)

    // Читаем пиксели для смешивания
    const imageData = outputCtx.getImageData(0, 0, width, height)
    const data = imageData.data
    const opacity = this.getParams().opacity

    for (let i = 0; i < segmentationMask.length; i++) {
      // segmentationMask: 0 = человек (foreground), 255 = фон (background)
      const isBackground = segmentationMask[i] > 128
      if (isBackground) {
        const px = i * 4
        // Смешиваем красный цвет с исходным пикселем
        data[px]     = Math.round(data[px]     * (1 - opacity) + 255 * opacity)
        data[px + 1] = Math.round(data[px + 1] * (1 - opacity))
        data[px + 2] = Math.round(data[px + 2] * (1 - opacity))
      }
    }

    outputCtx.putImageData(imageData, 0, 0)
  }
}
```

### Эффект с Face Mesh

```typescript
class FaceFrameEffect extends BaseEffect<{ color: string; lineWidth: number }> {
  readonly name = 'face-frame'
  readonly type = EffectType.FACE_MASK
  readonly requiredFeatures = [EffectFeature.FACE_MESH]

  constructor() {
    super({ color: '#00ff00', lineWidth: 2 })
  }

  apply(ctx: FrameContext): void {
    const { sourceCanvas, outputCtx, width, height, faceMesh } = ctx
    if (!faceMesh?.landmarks) return

    // Копируем оригинальный кадр
    outputCtx.drawImage(sourceCanvas, 0, 0)

    const { color, lineWidth } = this.getParams()
    outputCtx.strokeStyle = color
    outputCtx.lineWidth = lineWidth

    // faceMesh.landmarks — FaceLandmark[], 478 точек для одного лица (normalized 0–1)
    // Точки 0–16 — jawline (нижняя линия лица)
    const landmarks = faceMesh.landmarks
    outputCtx.beginPath()
    landmarks.slice(0, 17).forEach((point, i) => {
      const x = point.x * width   // нормализованные x/y переводим в пиксели
      const y = point.y * height
      i === 0 ? outputCtx.moveTo(x, y) : outputCtx.lineTo(x, y)
    })
    outputCtx.stroke()
  }
}
```

---

## Использование кастомного эффекта

```typescript
const sepia = new SepiaEffect()
await media.effectsController.addEffect(sepia)

// Изменить параметры
sepia.updateParams({ intensity: 0.5 })

// Включить/выключить без удаления из pipeline
sepia.setEnabled(false)
sepia.setEnabled(true)

// Удалить из pipeline
media.effectsController.removeEffect('sepia')
```

---

## ML-провайдеры

### SegmentationProvider

MediaPipe ImageSegmenter — сегментация человека от фона. Используется встроенным `EffectsPlugin` при наличии эффектов с `EffectFeature.SEGMENTATION`.

```typescript
import { SegmentationProvider } from 'valm-js'

const provider = new SegmentationProvider({
  config: {
    delegate: 'GPU',                                        // 'GPU' | 'CPU' (по умолчанию: GPU на десктопе, CPU на мобильных)
    wasmPath: '/mediapipe/wasm',                            // путь к папке с WASM файлами MediaPipe
    modelPath: '/mediapipe/models/selfie_segmenter.tflite', // путь к .tflite модели
    disableOnMobile: false,                                 // принудительно выключить на мобильных
  },
  minInterval: 33,    // throttle: не чаще чем раз в 33мс (~30 ML-кадров в секунду)
  cacheEnabled: true, // возвращать предыдущий результат при throttle
})

// Передать в EffectsPlugin вместо встроенного провайдера
media.use(new EffectsPlugin({
  providers: { segmentation: provider }
}))
```

### FaceMeshProvider

MediaPipe FaceLandmarker — 478 точек лица. Используется при наличии эффектов с `EffectFeature.FACE_MESH`.

```typescript
import { FaceMeshProvider } from 'valm-js'

const provider = new FaceMeshProvider({
  config: {
    modelPath: '/mediapipe/models/face_landmarker.task',  // путь к .task модели
    wasmPath: '/mediapipe/wasm',                          // путь к папке с WASM файлами MediaPipe
    delegate: 'GPU',                                      // 'CPU' | 'GPU' (по умолчанию: GPU)
    numFaces: 1,                                          // количество лиц для детекции
  },
  minInterval: 33,
  cacheEnabled: true,
})

media.use(new EffectsPlugin({
  providers: { faceMesh: provider }
}))
```

### Создание кастомного ML-провайдера

Реализуйте `IMLProvider` напрямую или унаследуйтесь от `BaseMLProvider` — он добавляет throttling, caching и anti-parallel защиту (повторный вызов `detect()` пока выполняется предыдущий — вернёт тот же промис).

```typescript
import { BaseMLProvider } from 'valm-js'

interface MyMLConfig {
  modelPath: string
}

interface MyMLResult {
  predictions: number[]
}

class MyMLProvider extends BaseMLProvider<MyMLConfig, MyMLResult> {
  constructor() {
    super({
      minInterval: 100,     // throttle: не чаще чем раз в 100мс
      cacheEnabled: true,   // возвращать предыдущий результат при throttle
    })
  }

  protected async onInitialize(config?: MyMLConfig): Promise<void> {
    // Загрузка модели — вызывается один раз при initialize()
  }

  protected async onDetect(imageData: ImageData, timestamp: number): Promise<MyMLResult> {
    // Инференс на imageData — вызывается с учётом throttle
    return { predictions: [] }
  }

  protected async onDispose(): Promise<void> {
    // Очистка ресурсов модели — вызывается при dispose()
  }
}
```

---

## Pipeline — ping-pong рендеринг

При цепочке из нескольких эффектов pipeline чередует запись между двумя canvas'ами. Последний эффект всегда пишет в `outputCanvas`. Не нужно беспокоиться о порядке — pipeline управляет этим автоматически.

---

## Краткая API-таблица

### BaseEffect\<TParams\>

| Метод | Тип | Описание |
|-------|-----|----------|
| `apply(ctx)` | `(FrameContext) => void` | Обработка кадра — abstract, переопределить обязательно |
| `initialize()` | `() => Promise<void>` | Инициализация — переопределить при необходимости |
| `updateParams(params)` | `(Partial<TParams>) => void` | Обновить параметры частично |
| `getParams()` | `() => TParams` | Получить копию текущих параметров |
| `isEnabled()` | `() => boolean` | Включён ли эффект |
| `setEnabled(b)` | `(boolean) => void` | Включить/выключить без удаления из pipeline |
| `dispose()` | `() => void` | Освободить ресурсы — переопределить при необходимости |
| `onParamsUpdated()` | `() => void` | Protected-хук после updateParams() |

### BaseMLProvider\<TConfig, TResult\>

| Метод | Тип | Описание |
|-------|-----|----------|
| `initialize(config?)` | `(TConfig?) => Promise<void>` | Инициализация модели — защита от повторного вызова |
| `detect(imageData, ts?)` | `(ImageData, number?) => Promise<TResult>` | Инференс с throttle и кэшем |
| `getLastResult()` | `() => TResult \| null` | Последний кэшированный результат |
| `isReady()` | `() => boolean` | Готов ли провайдер к детекции |
| `clearCache()` | `() => void` | Очистить кэш результатов |
| `dispose()` | `() => Promise<void>` | Освободить ресурсы |
