# Plugin API

Plugins extend `Valm` without bloating the core. Heavy dependencies (ML, recording, etc.) are loaded only if the plugin is attached.

## Attaching

```typescript
import { Valm } from 'valm-js';
import { EffectsPlugin } from 'valm-js/effects';

const media = new Valm();

// Chainable
media
  .use(new EffectsPlugin())
  .use(new MyCustomPlugin());

media.hasPlugin('effects');          // true
media.getPlugin('effects');          // EffectsPlugin instance
media.getPlugin<EffectsPlugin>('effects'); // typed
```

---

## Creating a plugin

### Interface

```typescript
interface IMediaPlugin {
  readonly name: string;              // unique plugin identifier
  install(context: PluginContext): void; // called from module.use()
  destroy(): void;                    // called from module.destroy()
}
```

### PluginContext

On install, the plugin gets access to the module's internal services:

```typescript
interface PluginContext {
  mediaStreamService: MediaStreamService;       // track and stream management
  configurationService: ConfigurationService;   // reading/subscribing to configuration
}
```

`mediaStreamService` emits events from `MediaEvents` (see [Event System](/docs/events)).
`configurationService` emits events like `videoConfigChanged`, `audioConfigChanged`, etc. (the `${section}ConfigChanged` pattern).

### Example: an analytics plugin

```typescript
import { IMediaPlugin, PluginContext } from 'valm-js';
import { MediaEvents } from 'valm-js';

class AnalyticsPlugin implements IMediaPlugin {
  readonly name = 'analytics';
  private unsubscribers: VoidFunction[] = [];

  install(context: PluginContext): void {
    const { mediaStreamService } = context;

    this.unsubscribers.push(
      mediaStreamService.on(MediaEvents.TRACK_ADDED, ({ kind, track }) => {
        // kind: 'video' | 'audio'
        // track: MediaStreamTrack
        this.track('track_added', { kind });
      }),
      mediaStreamService.on(MediaEvents.ERROR, ({ source, error }) => {
        // source: string — where the error came from
        this.track('media_error', { source });
      }),
    );
  }

  destroy(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
  }

  private track(name: string, data: Record<string, unknown>): void {
    console.log(`[Analytics] ${name}`, data);
  }
}

media.use(new AnalyticsPlugin());
```

### Example: a logging plugin

```typescript
import { IMediaPlugin, PluginContext } from 'valm-js';
import { MediaEvents } from 'valm-js';
import { ConfigurationChangeEvent } from 'valm-js';

class LoggerPlugin implements IMediaPlugin {
  readonly name = 'logger';
  private unsubscribers: VoidFunction[] = [];

  constructor(private level: 'debug' | 'info' | 'warn' = 'info') {}

  install(context: PluginContext): void {
    const { mediaStreamService, configurationService } = context;

    this.unsubscribers.push(
      // videoConfigChanged, audioConfigChanged — the `${section}ConfigChanged` pattern
      configurationService.on('videoConfigChanged', (event: ConfigurationChangeEvent) => {
        // event.property  — the changed property ('frameRate', 'deviceId', ...)
        // event.oldValue  — previous value
        // event.newValue  — new value
        this.log(`Video config: ${event.property} = ${event.newValue}`);
      }),
      configurationService.on('audioConfigChanged', (event: ConfigurationChangeEvent) => {
        this.log(`Audio config: ${event.property} = ${event.newValue}`);
      }),
      mediaStreamService.on(MediaEvents.TRACK_ADDED, ({ kind }) => {
        this.log(`Track added: ${kind}`);
      }),
      mediaStreamService.on(MediaEvents.TRACK_REMOVED, ({ kind }) => {
        this.log(`Track removed: ${kind}`);
      }),
    );
  }

  destroy(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
  }

  private log(...args: unknown[]): void {
    console[this.level]('[MediaLogger]', ...args);
  }
}

media.use(new LoggerPlugin('debug'));
```

---

## Built-in plugin: EffectsPlugin

The only out-of-the-box plugin. Enables video processing (blur, virtual background).

```typescript
import { EffectsPlugin } from 'valm-js/effects';

media.use(new EffectsPlugin({
  providers: {
    // optional ML provider configuration
  },
}));

// After attaching — access the controller
const effects = media.effectsController;
// or
const effects = media.getPlugin<EffectsPlugin>('effects')!.controller;
```

Without `EffectsPlugin`, the heavy ML dependencies are not loaded at all.

---

## API

### IMediaPlugin

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `name` | `string` (readonly) | Unique plugin name |
| `install(context)` | `void` | Initialization, called from `use()` |
| `destroy()` | `void` | Resource cleanup, called from `module.destroy()` |

### Valm — plugin methods

| Method | Returns | Description |
|--------|---------|-------------|
| `use(plugin)` | `this` | Attach a plugin (chainable) |
| `hasPlugin(name)` | `boolean` | Check presence |
| `getPlugin<T>(name)` | `T \| undefined` | Get a plugin by name |
