# PermissionsService

Проверка и запрос разрешений на доступ к камере и микрофону. Автоматический fallback для iOS.

## Доступ

```typescript
const permissions = media.permissions;
```

---

## Действия

### Проверка разрешений

```typescript
// checkPermission(type: MediaPermissionType): Promise<MediaPermissionState>
const state = await permissions.checkPermission('camera');
// 'granted' — доступ разрешён
// 'denied'  — доступ заблокирован пользователем
// 'prompt'  — браузер ещё не спрашивал
// 'unknown' — определить не удалось (iOS fallback)

await permissions.checkPermission('microphone');
```

```typescript
// checkAll(): Promise<MediaPermissions>
const { camera, microphone } = await permissions.checkAll();
// {
//   camera: 'granted',     // состояние доступа к камере
//   microphone: 'prompt'   // состояние доступа к микрофону
// }
```

### Запрос разрешений

```typescript
// requestPermission(type: MediaPermissionType): Promise<boolean>
const granted = await permissions.requestPermission('camera');
// true  — пользователь разрешил
// false — пользователь отказал или произошла ошибка

await permissions.requestPermission('microphone');
```

```typescript
// requestAll(): Promise<{ camera: boolean; microphone: boolean }>
const result = await permissions.requestAll();
// {
//   camera: true,      // разрешение на камеру получено
//   microphone: false  // в разрешении на микрофон отказано
// }
```

При `requestAll()` сначала запрашиваются оба разрешения одновременно. Если совместный запрос не удался — запрашиваются по отдельности.

---

## Подписки

```typescript
// onPermissionChange(type: MediaPermissionType, callback: PermissionChangeCallback): VoidFunction
const unsub = permissions.onPermissionChange('camera', (state: MediaPermissionState) => {
  // state: 'granted' | 'denied' | 'prompt' | 'unknown'
  if (state === 'denied') {
    showMessage('Доступ к камере заблокирован. Измените в настройках браузера.');
  }
  if (state === 'granted') {
    enableCameraButton();
  }
});

permissions.onPermissionChange('microphone', (state: MediaPermissionState) => {
  micBtn.disabled = state === 'denied';
});

// Отписаться
unsub();
```

Подписка использует `PermissionStatus.onchange` — браузерное API. На iOS подписка не поддерживается (нет Permissions API), коллбэк не вызывается автоматически.

---

## Типичные сценарии

### Проверка перед звонком

```typescript
const { camera, microphone } = await permissions.checkAll();

if (camera === 'denied' || microphone === 'denied') {
  showSettingsPrompt('Разрешите доступ к камере и микрофону в настройках браузера');
  return;
}

if (camera === 'prompt' || microphone === 'prompt') {
  const result = await permissions.requestAll();
  if (!result.camera || !result.microphone) {
    showError('Не удалось получить доступ к устройствам');
    return;
  }
}

// Разрешения получены — можно инициализировать
await media.initializeMedia();
```

### Реактивный UI

```typescript
permissions.onPermissionChange('camera', (state) => {
  cameraBtn.disabled = state === 'denied';
  cameraBtn.title = state === 'denied' ? 'Доступ заблокирован' : 'Включить камеру';
});

permissions.onPermissionChange('microphone', (state) => {
  micBtn.disabled = state === 'denied';
});
```

---

## iOS-хелперы

На iOS нет стандартного Permissions API для камеры и микрофона. Для работы с разрешениями на iOS используйте вспомогательные функции из \`valm\`:

```typescript
import {
  isIOS,
  isIOSSafari,
  isIOSChrome,
  requestIOSMediaPermissions,
} from 'valm-js';
```

### Определение платформы

```typescript
isIOS()      // true, если устройство на iOS
isIOSSafari() // true, если iOS Safari
isIOSChrome() // true, если iOS Chrome (WKWebView)
```

### Запрос разрешений на iOS

На iOS Safari требуется **user gesture** для первого вызова `getUserMedia`. Вызывайте `requestIOSMediaPermissions()` в обработчике нажатия кнопки:

```typescript
// requestIOSMediaPermissions(): Promise<{ video: boolean; audio: boolean }>
startBtn.addEventListener('click', async () => {
  if (isIOS()) {
    const result = await requestIOSMediaPermissions();
    // {
    //   video: true,  // разрешение на камеру получено
    //   audio: true   // разрешение на микрофон получено
    // }

    if (!result.video || !result.audio) {
      showError('Не удалось получить разрешения. Проверьте настройки Safari.');
      return;
    }
  }

  await media.initializeMedia();
});
```

Функция запрашивает минимальный медиапоток и сразу его останавливает — только для получения разрешений от браузера.

### Особенности iOS

- `PermissionsService.checkPermission()` автоматически использует fallback через `enumerateDevices()` на iOS
- Состояние разрешений определяется по наличию `label` у устройств — если label есть, значит разрешение `'granted'`
- `onPermissionChange()` на iOS не получает автоматических уведомлений об изменении разрешений

---

## Типы

### `MediaPermissionType`

```typescript
type MediaPermissionType = 'camera' | 'microphone'
```

### `MediaPermissionState`

```typescript
type MediaPermissionState =
  | 'granted'   // доступ разрешён
  | 'denied'    // доступ заблокирован
  | 'prompt'    // ещё не спрашивали
  | 'unknown'   // определить не удалось
```

### `MediaPermissions`

```typescript
interface MediaPermissions {
  camera: MediaPermissionState     // состояние разрешения на камеру
  microphone: MediaPermissionState // состояние разрешения на микрофон
}
```

### `PermissionChangeCallback`

```typescript
type PermissionChangeCallback = (state: MediaPermissionState) => void
```

---

## API

| Метод | Возврат | Описание |
|-------|---------|----------|
| `checkPermission(type)` | `Promise<MediaPermissionState>` | Проверить одно разрешение |
| `checkAll()` | `Promise<MediaPermissions>` | Проверить камеру и микрофон |
| `requestPermission(type)` | `Promise<boolean>` | Запросить одно разрешение |
| `requestAll()` | `Promise<{camera, microphone}>` | Запросить оба разрешения |
| `onPermissionChange(type, cb)` | `VoidFunction` | Подписка на изменение |

## iOS-хелперы API

| Функция | Возврат | Описание |
|---------|---------|----------|
| `isIOS()` | `boolean` | Определить iOS |
| `isIOSSafari()` | `boolean` | Определить iOS Safari |
| `isIOSChrome()` | `boolean` | Определить iOS Chrome |
| `requestIOSMediaPermissions()` | `Promise<{video, audio}>` | Запросить разрешения (требует user gesture) |
