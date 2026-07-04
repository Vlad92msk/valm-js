# Diagnostics

A single pre-call diagnostic flow: checks the browser, permissions, camera,
microphone and speaker in one call and returns a ready report. A thin wrapper over the
existing controllers — it adds no capture logic of its own and cleans up all temporary
resources after itself (preview tracks, `AudioContext`).

## Access

```typescript
const diagnostics = media.diagnostics;
```

---

## Running

```typescript
const report = await media.diagnostics.run({
  camera: true,
  microphone: true,
  speaker: true,
})
```

Sections can be turned off — a disabled section stays in the report in its default
(non-`ok`) state and is not run:

```typescript
// browser + permissions only, no device access
const report = await media.diagnostics.run({ camera: false, microphone: false, speaker: false })
```

### `DiagnosticsReport`

```typescript
interface DiagnosticsReport {
  browser: { supported: boolean; getUserMedia: boolean; getDisplayMedia: boolean }
  permissions: { camera: MediaPermissionState; microphone: MediaPermissionState }
  camera: { ok: boolean; deviceLabel?: string; resolution?: { width: number; height: number }; error?: string }
  microphone: { ok: boolean; deviceLabel?: string; peakVolume?: number; error?: string }
  speaker: { ok: boolean; testPlayed: boolean; error?: string }
}
```

- **camera** — brings up a preview track, reads the device label and resolution, then cleans up.
- **microphone** — brings up a preview and captures peak volume via VAD over ~1.5 s.
- **speaker** — plays a short test tone (`testPlayed`).

---

## Step-by-step progress (UI wizard)

```typescript
const unsub = media.diagnostics.onStep((step) => {
  // step.name: 'browser' | 'permissions' | 'camera' | 'microphone' | 'speaker'
  // step.status: 'running' | 'ok' | 'failed'
  updateWizardStep(step.name, step.status)
})

await media.diagnostics.run()
unsub()
```

Steps arrive in order: `browser → permissions → camera → microphone → speaker`.
Each section goes through `running` and a final `ok` / `failed`.

---

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `run(options?)` | `Promise<DiagnosticsReport>` | Run diagnostics and return the report |
| `onStep(cb)` | `VoidFunction` | Subscribe to run steps |
