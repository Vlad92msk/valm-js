# Creating custom effects

A guide to building your own video effects: from simple filters to ML-based effects.

## Effects architecture

Each effect implements the `IVideoEffect` interface. For convenience, a base class `BaseEffect` is provided.

### IVideoEffect

```typescript
interface IVideoEffect<TParams = unknown> {
  readonly name: string               // unique identifier — used in getEffect() / removeEffect()
  readonly type: EffectType           // effect category
  readonly requiredFeatures: EffectFeature[]  // which ML data is needed in FrameContext

  initialize(): Promise<void>         // called once on addEffect()
  apply(ctx: FrameContext): void      // called synchronously every frame — all ML data is already ready in ctx
  updateParams(params: Partial<TParams>): void
  getParams(): TParams
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  dispose(): void                     // release resources on removeEffect()
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
  SEGMENTATION = 'segmentation',  // background/person mask — available in ctx.segmentation and ctx.segmentationMask
  FACE_MESH = 'faceMesh',         // 478 face landmarks — available in ctx.faceMesh
}
```

If an effect declares `requiredFeatures`, the pipeline automatically starts the needed ML providers and passes the results into `FrameContext`. Providers start lazily on the first `addEffect` and are released when no effect requires them anymore.

---

## BaseEffect

A base class with parameter management and lifecycle handling:

```typescript
import { BaseEffect, EffectType, EffectFeature, FrameContext } from 'valm-js/effects'

class MyEffect extends BaseEffect<MyParams> {
  readonly name = 'my-effect'           // unique identifier
  readonly type = EffectType.COLOR_FILTER
  readonly requiredFeatures: EffectFeature[] = []

  constructor() {
    super({ /* default parameters */ })
  }

  apply(ctx: FrameContext): void {
    // Read from ctx.sourceCanvas, write to ctx.outputCanvas
  }

  // Optional: called after updateParams()
  protected onParamsUpdated(): void {
    // React to a parameter change
  }
}
```

---

## FrameContext

Every `apply()` call receives the context of the current frame:

```typescript
interface FrameContext {
  sourceCanvas: HTMLCanvasElement      // input canvas with the original frame (read-only)
  sourceCtx: CanvasRenderingContext2D  // 2d context of sourceCanvas
  outputCanvas: HTMLCanvasElement      // output canvas — write the result here
  outputCtx: CanvasRenderingContext2D  // 2d context of outputCanvas
  width: number    // frame width in pixels
  height: number   // frame height in pixels
  timestamp: number  // performance.now() — the frame time

  // Available if requiredFeatures includes SEGMENTATION:
  segmentation?: {
    maskData: Uint8Array  // 0 = person (foreground), 255 = background
    width: number         // mask width (may differ from the frame size)
    height: number        // mask height
    timestamp: number
  }
  segmentationMask?: Uint8Array  // maskData scaled to the frame size (width * height pixels)

  // Available if requiredFeatures includes FACE_MESH:
  faceMesh?: {
    landmarks: FaceLandmark[] | null  // 478 face landmarks (normalized 0–1), null if no face found
    transformationMatrix: number[] | null  // 4×4 transformation matrix — flat array of 16 numbers, for 3D effects
    timestamp: number
  }
}

// A single face landmark:
interface FaceLandmark {
  x: number   // 0–1 across the frame width
  y: number   // 0–1 across the frame height
  z?: number  // depth (not always available)
}
```

---

## Examples

### A simple color filter (no ML)

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

### An effect with segmentation

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

    // Copy the original frame
    outputCtx.drawImage(sourceCanvas, 0, 0)

    // Read pixels for blending
    const imageData = outputCtx.getImageData(0, 0, width, height)
    const data = imageData.data
    const opacity = this.getParams().opacity

    for (let i = 0; i < segmentationMask.length; i++) {
      // segmentationMask: 0 = person (foreground), 255 = background
      const isBackground = segmentationMask[i] > 128
      if (isBackground) {
        const px = i * 4
        // Blend red with the source pixel
        data[px]     = Math.round(data[px]     * (1 - opacity) + 255 * opacity)
        data[px + 1] = Math.round(data[px + 1] * (1 - opacity))
        data[px + 2] = Math.round(data[px + 2] * (1 - opacity))
      }
    }

    outputCtx.putImageData(imageData, 0, 0)
  }
}
```

### An effect with Face Mesh

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

    // Copy the original frame
    outputCtx.drawImage(sourceCanvas, 0, 0)

    const { color, lineWidth } = this.getParams()
    outputCtx.strokeStyle = color
    outputCtx.lineWidth = lineWidth

    // faceMesh.landmarks — FaceLandmark[], 478 points for one face (normalized 0–1)
    // Points 0–16 — jawline (the lower line of the face)
    const landmarks = faceMesh.landmarks
    outputCtx.beginPath()
    landmarks.slice(0, 17).forEach((point, i) => {
      const x = point.x * width   // convert normalized x/y to pixels
      const y = point.y * height
      i === 0 ? outputCtx.moveTo(x, y) : outputCtx.lineTo(x, y)
    })
    outputCtx.stroke()
  }
}
```

---

## Using a custom effect

```typescript
const sepia = new SepiaEffect()
await media.effectsController.addEffect(sepia)

// Change parameters
sepia.updateParams({ intensity: 0.5 })

// Enable/disable without removing from the pipeline
sepia.setEnabled(false)
sepia.setEnabled(true)

// Remove from the pipeline
media.effectsController.removeEffect('sepia')
```

---

## ML providers

### SegmentationProvider

MediaPipe ImageSegmenter — separating the person from the background. Used by the built-in `EffectsPlugin` when effects with `EffectFeature.SEGMENTATION` are present.

```typescript
import { SegmentationProvider } from 'valm-js/effects'

const provider = new SegmentationProvider({
  config: {
    delegate: 'GPU',                                        // 'GPU' | 'CPU' (default: GPU on desktop, CPU on mobile)
    wasmPath: '/mediapipe/wasm',                            // path to the folder with MediaPipe WASM files
    modelPath: '/mediapipe/models/selfie_segmenter.tflite', // path to the .tflite model
    disableOnMobile: false,                                 // force off on mobile
  },
  minInterval: 33,    // throttle: no more than once every 33ms (~30 ML frames per second)
  cacheEnabled: true, // return the previous result while throttled
})

// Pass into EffectsPlugin instead of the built-in provider
media.use(new EffectsPlugin({
  providers: { segmentation: provider }
}))
```

### FaceMeshProvider

MediaPipe FaceLandmarker — 478 face landmarks. Used when effects with `EffectFeature.FACE_MESH` are present.

```typescript
import { FaceMeshProvider } from 'valm-js/effects'

const provider = new FaceMeshProvider({
  config: {
    modelPath: '/mediapipe/models/face_landmarker.task',  // path to the .task model
    wasmPath: '/mediapipe/wasm',                          // path to the folder with MediaPipe WASM files
    delegate: 'GPU',                                      // 'CPU' | 'GPU' (default: GPU)
    numFaces: 1,                                          // number of faces to detect
  },
  minInterval: 33,
  cacheEnabled: true,
})

media.use(new EffectsPlugin({
  providers: { faceMesh: provider }
}))
```

### Creating a custom ML provider

Implement `IMLProvider` directly or extend `BaseMLProvider` — it adds throttling, caching and anti-parallel protection (a repeated `detect()` call while the previous one is running returns the same promise).

```typescript
import { BaseMLProvider } from 'valm-js/effects'

interface MyMLConfig {
  modelPath: string
}

interface MyMLResult {
  predictions: number[]
}

class MyMLProvider extends BaseMLProvider<MyMLConfig, MyMLResult> {
  constructor() {
    super({
      minInterval: 100,     // throttle: no more than once every 100ms
      cacheEnabled: true,   // return the previous result while throttled
    })
  }

  protected async onInitialize(config?: MyMLConfig): Promise<void> {
    // Load the model — called once on initialize()
  }

  protected async onDetect(imageData: ImageData, timestamp: number): Promise<MyMLResult> {
    // Inference on imageData — called subject to throttling
    return { predictions: [] }
  }

  protected async onDispose(): Promise<void> {
    // Clean up model resources — called on dispose()
  }
}
```

---

## Pipeline — ping-pong rendering

With a chain of several effects, the pipeline alternates writing between two canvases. The last effect always writes to `outputCanvas`. You don't need to worry about the order — the pipeline manages it automatically.

---

## Quick API reference

### BaseEffect\<TParams\>

| Method | Type | Description |
|--------|------|-------------|
| `apply(ctx)` | `(FrameContext) => void` | Frame processing — abstract, must be overridden |
| `initialize()` | `() => Promise<void>` | Initialization — override if needed |
| `updateParams(params)` | `(Partial<TParams>) => void` | Update parameters partially |
| `getParams()` | `() => TParams` | Get a copy of the current parameters |
| `isEnabled()` | `() => boolean` | Whether the effect is enabled |
| `setEnabled(b)` | `(boolean) => void` | Enable/disable without removing from the pipeline |
| `dispose()` | `() => void` | Release resources — override if needed |
| `onParamsUpdated()` | `() => void` | Protected hook after updateParams() |

### BaseMLProvider\<TConfig, TResult\>

| Method | Type | Description |
|--------|------|-------------|
| `initialize(config?)` | `(TConfig?) => Promise<void>` | Model initialization — guarded against repeated calls |
| `detect(imageData, ts?)` | `(ImageData, number?) => Promise<TResult>` | Inference with throttling and cache |
| `getLastResult()` | `() => TResult \| null` | Last cached result |
| `isReady()` | `() => boolean` | Whether the provider is ready to detect |
| `clearCache()` | `() => void` | Clear the result cache |
| `dispose()` | `() => Promise<void>` | Release resources |
