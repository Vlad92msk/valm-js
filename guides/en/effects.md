# EffectsController

Managing video effects: background blur, virtual background, custom effects, processing quality.

> Requires attaching `EffectsPlugin` via `module.use()`. Without the plugin, the ML dependencies (`@mediapipe/tasks-vision`) are not loaded.

## Access

```typescript
import { Valm } from 'valm-js'
import { EffectsPlugin } from 'valm-js/effects'

const media = new Valm(config)

// Attach the plugin — built-in MediaPipe providers
media.use(new EffectsPlugin())

// Or with custom ML providers instead of the built-in ones
media.use(new EffectsPlugin({
  providers: {
    segmentation: new MySegmentationProvider(), // replaces the built-in MediaPipe segmentation
    faceMesh: new MyFaceMeshProvider(),          // replaces the built-in MediaPipe face mesh
  }
}))

await media.initializeMedia()

const effects = media.effectsController
```

---

## Actions

### Background blur

```typescript
// enableBlur(params?: Partial<BackgroundBlurParams>)
await effects.enableBlur()                // enable with default parameters

await effects.enableBlur({
  intensity: 0.8,             // blur strength: 0 (none) — 1 (maximum), default 0.7
  mode: BlurMode.BACKGROUND,  // BlurMode.BACKGROUND — blurs the background, BlurMode.FOREGROUND — blurs the person
  edgeSmoothing: true,        // smoothing of the mask edges
  smoothingThreshold: 0.5,    // smoothing threshold (0-1)
})

// setBlurIntensity(intensity: number)
effects.setBlurIntensity(0.5)   // the value is clamped to the range [0, 1]
effects.setBlurIntensity(1.0)   // maximum blur

// setBlurMode(mode: BlurMode)
effects.setBlurMode(BlurMode.BACKGROUND)   // blurs the background behind the person
effects.setBlurMode(BlurMode.FOREGROUND)   // blurs the person themselves

// disableBlur() — disables without removing from the pipeline
effects.disableBlur()

// toggleBlur() — enables if disabled, disables if enabled
await effects.toggleBlur()
```

### Virtual background

```typescript
// setVirtualBackground(imageUrl: string)
await effects.setVirtualBackground('/backgrounds/office.jpg')
await effects.setVirtualBackground('https://cdn.example.com/bg.png')

// Blur and virtual background conflict:
// calling setVirtualBackground automatically disables an active blur

// setVirtualBackgroundColor(color: string) — a color instead of an image
effects.setVirtualBackgroundColor('#00AA00')   // a CSS color, any format
effects.setVirtualBackgroundColor('blue')
effects.setVirtualBackgroundColor('rgba(0,0,0,0.8)')

// setVirtualBackgroundFitMode(mode: BackgroundFitMode)
effects.setVirtualBackgroundFitMode(BackgroundFitMode.COVER)    // cover the whole area, cropping the excess
effects.setVirtualBackgroundFitMode(BackgroundFitMode.CONTAIN)  // fit entirely, adding margins
effects.setVirtualBackgroundFitMode(BackgroundFitMode.STRETCH)  // stretch across the whole area
effects.setVirtualBackgroundFitMode(BackgroundFitMode.TILE)     // tile by repetition

// updateVirtualBackgroundParams(params: Partial<VirtualBackgroundParams>)
effects.updateVirtualBackgroundParams({
  imageUrl: '/backgrounds/beach.jpg',   // a new image
  fitMode: BackgroundFitMode.COVER,
  edgeSmoothing: true,        // edge smoothing
  smoothingThreshold: 0.5,    // smoothing threshold (0-1)
  edgeBlur: 2,                // blur radius of the mask edges (pixels)
})

// removeVirtualBackground() — disables the effect without removing from the pipeline
effects.removeVirtualBackground()

// toggleVirtualBackground(imageUrl?: string)
await effects.toggleVirtualBackground('/backgrounds/office.jpg')  // enable with a URL
await effects.toggleVirtualBackground()                           // disable (if active)
// Throws: if disabled and imageUrl is not provided
```

### Quality and performance

```typescript
// setQualityPreset(preset: QualityPreset)
effects.setQualityPreset('mobile')  // lightweight preset for mobile devices
effects.setQualityPreset('low')     // minimal load, lower quality
effects.setQualityPreset('medium')  // balance of quality and load (default)
effects.setQualityPreset('high')    // high quality
effects.setQualityPreset('ultra')   // maximum quality, high load
effects.setQualityPreset('custom')  // manual tuning via setPerformanceConfig

// setPerformanceConfig(config: PerformanceConfig)
effects.setPerformanceConfig({
  preset: 'custom',        // 'mobile' | 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  targetFps: 24,           // target rendering FPS
  mlFrameSkip: 2,          // ML analysis every Nth frame (1 = every frame, 2 = every other)
  mlResolutionScale: 0.5,  // scale of the input image for ML (1.0 = full, 0.5 = half)
  blurQuality: 15,         // blur radius, controlled by the pipeline via presets
})

// Shortcut methods — set preset: 'custom' and change one parameter
effects.setTargetFps(30)     // target rendering FPS
effects.setBlurQuality(20)   // blur radius
```

### Managing effects

```typescript
// addEffect(effect: IVideoEffect) — add a custom effect to the pipeline
await effects.addEffect(myCustomEffect)

// removeEffect(name: string) — remove an effect by name
effects.removeEffect('my-custom-effect')
effects.removeEffect('background_blur')        // name of the built-in blur effect
effects.removeEffect('virtual_background')     // name of the built-in virtual background effect

// getEffect<T>(name: string) — get an effect by name
const blur = effects.getEffect('background_blur')        // BackgroundBlurEffect | null
const myEffect = effects.getEffect<MyEffect>('my-effect') // T | null

// getEffects() — all effects in the pipeline
const all = effects.getEffects()
// [{ name, type, requiredFeatures, isEnabled(), ... }, ...]

// disableAllEffects() — disable all (does not remove from the pipeline, the pipeline keeps running)
effects.disableAllEffects()

// stopProcessing() — remove all effects from the pipeline and fully stop processing
effects.stopProcessing()
```

---

## Getters and state

```typescript
effects.state        // EffectsState — current state (getter)

effects.getPipelineState()  // PipelineState | null — processing pipeline state

effects.getBlurParams()               // BackgroundBlurParams | null — blur parameters
effects.getVirtualBackgroundParams()  // VirtualBackgroundParams | null — virtual background parameters
effects.getPerformanceConfig()        // PerformanceConfig — current performance settings
```

### `EffectsState`

```typescript
interface EffectsState {
  isProcessingEnabled: boolean  // whether the video-processing pipeline is running
  activeEffects: string[]       // names of active (enabled) effects in the pipeline
  currentFps: number            // current pipeline FPS (0 if not running)
  blur: {
    isEnabled: boolean  // whether the blur effect is enabled
    intensity: number   // current intensity (0-1)
    mode: BlurMode      // BlurMode.BACKGROUND | BlurMode.FOREGROUND
  }
  virtualBackground: {
    isEnabled: boolean    // whether the virtual background effect is enabled
    image: string | null  // URL of the current image (null if a color is used or not active)
  }
  performance?: PerformanceConfig  // current performance settings (if the pipeline is running)
}
```

### `BackgroundBlurParams`

```typescript
interface BackgroundBlurParams {
  intensity: number         // blur strength: 0 (none) — 1 (maximum)
  mode: BlurMode            // BlurMode.BACKGROUND | BlurMode.FOREGROUND
  edgeSmoothing: boolean    // smoothing of the mask edges
  smoothingThreshold: number // smoothing threshold (0-1)
}
```

### `VirtualBackgroundParams`

```typescript
interface VirtualBackgroundParams {
  imageUrl: string | null      // URL of the background image (null — backgroundColor is used)
  backgroundColor: string      // CSS background color (fallback or if imageUrl === null)
  fitMode: BackgroundFitMode   // scaling mode: COVER | CONTAIN | STRETCH | TILE
  edgeSmoothing: boolean       // smoothing of the mask edges
  smoothingThreshold: number   // smoothing threshold (0-1)
  edgeBlur: number             // blur radius of the mask edges (pixels, 0 = disabled)
}
```

### `PerformanceConfig`

```typescript
interface PerformanceConfig {
  preset?: QualityPreset      // 'mobile' | 'low' | 'medium' | 'high' | 'ultra' | 'custom'
  mlFrameSkip?: number        // ML analysis every Nth frame (1 = every frame, 2 = every other)
  targetFps?: number          // target rendering FPS
  blurQuality?: number        // blur radius (controlled via presets or manually)
  mlResolutionScale?: number  // scale of the input image for ML (1.0 = full, 0.5 = half)
}
```

### `PipelineState`

```typescript
interface PipelineState {
  isRunning: boolean           // whether the pipeline is running
  currentFps: number           // current processing FPS
  activeEffects: string[]      // names of active effects
  gpuEnabled: boolean          // whether GPU acceleration is used
  processorType?: 'canvas' | 'insertable-streams'  // type of the frame processor
}
```

---

## Subscriptions

Every subscription returns an unsubscribe function.

```typescript
const unsub = effects.onStateChange((state: EffectsState) => {
  // state.isProcessingEnabled: boolean — pipeline running
  // state.activeEffects: string[]      — names of active effects
  // state.currentFps: number           — current FPS
  // state.blur.isEnabled: boolean      — whether blur is enabled
  // state.blur.intensity: number       — blur intensity (0-1)
  // state.blur.mode: BlurMode          — blur mode
  // state.virtualBackground.isEnabled: boolean  — whether the virtual background is enabled
  // state.virtualBackground.image: string | null — background URL (null if none)
  console.log('Effects state:', state.blur.isEnabled, state.currentFps)
})

effects.onError((error) => {
  // error.source: string    — error source ('effects')
  // error.action?: string   — the action during which the error occurred ('enableBlur', 'setVirtualBackground', ...)
  // error.error: unknown    — the original error object
  console.error(`Effects error [${error.action}]:`, error.error)
})

unsub() // unsubscribe
```

### Events (TypedEventEmitter)

```typescript
import { EffectsEvents } from 'valm-js/effects'

effects.on(EffectsEvents.STATE_CHANGED, (state: EffectsState) => { ... })
effects.on(EffectsEvents.EFFECT_ENABLED, ({ effect }: { effect: string }) => {
  console.log('Effect enabled:', effect)  // 'background_blur' | 'virtual_background' | a custom name
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

| Method / getter | Returns | Description |
|-----------------|---------|-------------|
| `enableBlur(params?)` | `Promise<void>` | Enable background blur |
| `disableBlur()` | `void` | Disable blur (without removing from the pipeline) |
| `toggleBlur()` | `Promise<void>` | Toggle blur |
| `setBlurIntensity(n)` | `void` | Blur intensity (0-1) |
| `setBlurMode(mode)` | `void` | Mode: BACKGROUND or FOREGROUND |
| `getBlurParams()` | `BackgroundBlurParams \| null` | Current blur parameters |
| `setVirtualBackground(url)` | `Promise<void>` | Set the background image |
| `removeVirtualBackground()` | `void` | Disable the virtual background |
| `toggleVirtualBackground(url?)` | `Promise<void>` | Toggle the virtual background |
| `setVirtualBackgroundColor(c)` | `void` | A CSS color instead of an image |
| `setVirtualBackgroundFitMode(m)` | `void` | Background scaling mode |
| `updateVirtualBackgroundParams(p)` | `void` | Update several parameters |
| `getVirtualBackgroundParams()` | `VirtualBackgroundParams \| null` | Current virtual background parameters |
| `setQualityPreset(preset)` | `void` | Quality preset |
| `setPerformanceConfig(config)` | `void` | Full performance tuning |
| `getPerformanceConfig()` | `PerformanceConfig` | Current performance settings |
| `setTargetFps(fps)` | `void` | Target FPS (sets preset: 'custom') |
| `setBlurQuality(n)` | `void` | Blur radius (sets preset: 'custom') |
| `addEffect(effect)` | `Promise<void>` | Add a custom effect to the pipeline |
| `removeEffect(name)` | `void` | Remove an effect by name |
| `getEffect<T>(name)` | `T \| null` | Get an effect by name |
| `getEffects()` | `IVideoEffect[]` | All effects in the pipeline |
| `disableAllEffects()` | `void` | Disable all effects (the pipeline keeps running) |
| `stopProcessing()` | `void` | Remove all effects and stop the pipeline |
| `state` | `EffectsState` | Current state (getter) |
| `getPipelineState()` | `PipelineState \| null` | Pipeline state |
| `onStateChange(cb)` | `VoidFunction` | Subscribe to state changes |
| `onError(cb)` | `VoidFunction` | Subscribe to errors |
