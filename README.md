<h1 align="center">valm</h1>

<p align="center">
  A framework-agnostic TypeScript library for managing media streams in the browser.<br/>
  Camera, microphone, screen share, recording, speech transcription, and real-time video effects — one clean API.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/valm-js"><img src="https://img.shields.io/npm/v/valm-js.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/valm-js.svg" alt="license"></a>
  <img src="https://img.shields.io/badge/types-included-blue.svg" alt="TypeScript">
</p>

<p align="center">
  <a href="https://valm-js.web.app"><b>Live docs &amp; demo</b></a>
</p>

---

## Why valm

Working with `getUserMedia`, `getDisplayMedia`, `MediaRecorder`, the Web Speech API and WebGL effects directly means juggling a lot of low-level, quirky, cross-browser APIs. `valm` wraps all of that behind a small, typed, event-driven API — with no framework lock-in (works with React, Vue, Svelte, or vanilla JS).

- **Camera** — enable/disable, device switching, front/back toggle, live preview, resolution & frame rate control
- **Microphone** — mute/unmute (soft mute), device switching, voice-activity & volume detection
- **Screen share** — start/stop, display-surface selection
- **Recording** — `MediaRecorder` wrapper with quality presets, size/duration limits, chunked streaming, and blob helpers
- **Transcription** — speech-to-text via the Web Speech API
- **Video effects** — background blur & virtual background (powered by MediaPipe), plus a pluggable pipeline for custom effects
- **Plugin system** — extend the core without forking
- **Zero framework deps** — pure TypeScript, tree-shakeable, effects code split into a separate entry point

## Install

```bash
yarn add valm-js
```

Video effects (blur / virtual background) rely on `@mediapipe/tasks-vision`, declared as an optional peer dependency:

```bash
yarn add @mediapipe/tasks-vision
```

## Quick start

```typescript
import { Valm } from 'valm-js'

const media = new Valm({
  video: { enabled: true },
  audio: { enabled: true },
})

await media.initialize()

const stream = media.cameraController.getStream()
videoElement.srcObject = stream
```

Everything is exposed through controllers on the `Valm` instance:

| Controller | Access | What it does |
|---|---|---|
| Camera | `media.cameraController` | Enable/disable, device switching, preview |
| Microphone | `media.microphoneController` | Enable/mute/disable, voice detection |
| Screen share | `media.screenShareController` | Start/stop, surface selection |
| Recording | `media.recordingController` | Start/stop/pause, format, limits, streaming |
| Transcription | `media.transcriptionController` | Speech-to-text (Web Speech API) |
| Devices | `media.devicesController` | List cameras/mics, watch for changes |
| Configuration | `media.configurationController` | Read/update/export/import config |
| Effects | `media.effectsController` | Video effects (requires `EffectsPlugin`) |
| Permissions | `media.permissions` | Check camera/microphone permissions |

👉 **Full API reference and examples:** [`packages/valm/README.md`](./packages/valm/README.md) and the [live docs](https://valm-js.web.app).

## Documentation

In-depth guides live in [`guides/`](./guides) and power the documentation site:

[Getting started](./guides/getting-started.md) · [Camera](./guides/camera.md) · [Microphone](./guides/microphone.md) · [Screen share](./guides/screen-share.md) · [Recording](./guides/recording.md) · [Transcription](./guides/transcription.md) · [Devices](./guides/devices.md) · [Permissions](./guides/permissions.md) · [Configuration](./guides/configuration.md) · [Events](./guides/events.md) · [Effects](./guides/effects.md) · [Custom effects](./guides/custom-effects.md) · [Plugins](./guides/plugins.md) · [Utilities](./guides/utilities.md)

## Browser support

`valm` targets modern evergreen browsers. Some features are platform-limited:

- **Transcription** relies on the Web Speech API — Chrome and Edge only.
- **Video effects** require WebGL and `@mediapipe/tasks-vision`.
- Recording formats (`webm` / `mp4` / `mkv`) depend on the browser's `MediaRecorder` codec support.

## Repository layout

This is a Yarn workspaces monorepo:

```
valm-js/
├── packages/
│   ├── valm/         # the npm package (valm-js) — framework-agnostic core
│   └── homepage/     # documentation & demo site (React + Vite)
├── guides/           # Markdown docs — single source of truth for the docs site
├── LICENSE
└── README.md
```

## Development

```bash
yarn install

# build the library
yarn build

# run the docs/demo site locally
yarn dev:homepage

# type-check all packages
yarn typecheck
```

## Contributing

Issues and pull requests are welcome. For substantial changes, please open an issue first to discuss what you'd like to change.

## License

[MIT](./LICENSE) © Vlad92msk
