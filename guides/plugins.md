# Plugin API

Плагины расширяют `Valm` без увеличения ядра. Тяжёлые зависимости (ML, запись и т.д.) загружаются только если плагин подключён.

## Подключение

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
media.getPlugin<EffectsPlugin>('effects'); // с типом
```

---

## Создание плагина

### Интерфейс

```typescript
interface IMediaPlugin {
  readonly name: string;              // уникальный идентификатор плагина
  install(context: PluginContext): void; // вызывается из module.use()
  destroy(): void;                    // вызывается из module.destroy()
}
```

### PluginContext

При установке плагин получает доступ к внутренним сервисам модуля:

```typescript
interface PluginContext {
  mediaStreamService: MediaStreamService;       // управление треками и потоком
  configurationService: ConfigurationService;   // чтение/подписка на конфигурацию
}
```

`mediaStreamService` эмитирует события из `MediaEvents` (см. [Event System](./events.md)).
`configurationService` эмитирует события вида `videoConfigChanged`, `audioConfigChanged` и т.д. (паттерн `${section}ConfigChanged`).

### Пример: плагин аналитики

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
        // source: string — откуда ошибка
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

### Пример: плагин логирования

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
      // videoConfigChanged, audioConfigChanged — паттерн `${section}ConfigChanged`
      configurationService.on('videoConfigChanged', (event: ConfigurationChangeEvent) => {
        // event.property  — изменённое свойство ('frameRate', 'deviceId', ...)
        // event.oldValue  — предыдущее значение
        // event.newValue  — новое значение
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

## Встроенный плагин: EffectsPlugin

Единственный плагин из коробки. Подключает видео-обработку (blur, виртуальный фон).

```typescript
import { EffectsPlugin } from 'valm-js/effects';

media.use(new EffectsPlugin({
  providers: {
    // опциональная конфигурация ML-провайдеров
  },
}));

// После подключения — доступ к контроллеру
const effects = media.effectsController;
// или
const effects = media.getPlugin<EffectsPlugin>('effects')!.controller;
```

Без `EffectsPlugin` — тяжёлые ML-зависимости не загружаются совсем.

---

## API

### IMediaPlugin

| Свойство/Метод | Тип | Описание |
|----------------|-----|----------|
| `name` | `string` (readonly) | Уникальное имя плагина |
| `install(context)` | `void` | Инициализация, вызывается из `use()` |
| `destroy()` | `void` | Очистка ресурсов, вызывается из `module.destroy()` |

### Valm — методы плагинов

| Метод | Возврат | Описание |
|-------|---------|----------|
| `use(plugin)` | `this` | Подключить плагин (chainable) |
| `hasPlugin(name)` | `boolean` | Проверить наличие |
| `getPlugin<T>(name)` | `T \| undefined` | Получить плагин по имени |
