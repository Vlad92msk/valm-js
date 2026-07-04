# Diagnostics

Единый pre-call диагностический флоу: проверка браузера, разрешений, камеры,
микрофона и динамика одним вызовом с готовым отчётом. Тонкая обёртка поверх
существующих контроллеров — своей логики захвата не добавляет и чистит за собой
все временные ресурсы (превью-треки, `AudioContext`).

## Доступ

```typescript
const diagnostics = media.diagnostics;
```

---

## Запуск

```typescript
const report = await media.diagnostics.run({
  camera: true,
  microphone: true,
  speaker: true,
})
```

Разделы можно выключать — выключенный остаётся в отчёте в дефолтном (не `ok`)
состоянии и не запускается:

```typescript
// только браузер + разрешения, без обращения к устройствам
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

- **camera** — поднимает превью-трек, читает метку устройства и разрешение, затем чистит.
- **microphone** — поднимает превью и снимает пик громкости через VAD за ~1.5 с.
- **speaker** — проигрывает короткий тестовый тон (`testPlayed`).

---

## Пошаговый прогресс (UI-визард)

```typescript
const unsub = media.diagnostics.onStep((step) => {
  // step.name: 'browser' | 'permissions' | 'camera' | 'microphone' | 'speaker'
  // step.status: 'running' | 'ok' | 'failed'
  updateWizardStep(step.name, step.status)
})

await media.diagnostics.run()
unsub()
```

Шаги приходят в порядке: `browser → permissions → camera → microphone → speaker`.
Каждый раздел проходит через `running` и финальный `ok` / `failed`.

---

## API

| Метод | Возврат | Описание |
|-------|---------|----------|
| `run(options?)` | `Promise<DiagnosticsReport>` | Прогнать диагностику и вернуть отчёт |
| `onStep(cb)` | `VoidFunction` | Подписка на шаги прогона |
