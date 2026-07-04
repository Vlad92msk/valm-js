# PermissionsService

Checking and requesting access permissions for the camera and microphone. Automatic fallback for iOS.

## Access

```typescript
const permissions = media.permissions;
```

---

## Actions

### Checking permissions

```typescript
// checkPermission(type: MediaPermissionType): Promise<MediaPermissionState>
const state = await permissions.checkPermission('camera');
// 'granted' — access allowed
// 'denied'  — access blocked by the user
// 'prompt'  — the browser hasn't asked yet
// 'unknown' — could not be determined (iOS fallback)

await permissions.checkPermission('microphone');
```

```typescript
// checkAll(): Promise<MediaPermissions>
const { camera, microphone } = await permissions.checkAll();
// {
//   camera: 'granted',     // camera access state
//   microphone: 'prompt'   // microphone access state
// }
```

### Requesting permissions

```typescript
// requestPermission(type: MediaPermissionType): Promise<boolean>
const granted = await permissions.requestPermission('camera');
// true  — the user allowed it
// false — the user denied it or an error occurred

await permissions.requestPermission('microphone');
```

```typescript
// requestAll(): Promise<{ camera: boolean; microphone: boolean }>
const result = await permissions.requestAll();
// {
//   camera: true,      // camera permission granted
//   microphone: false  // microphone permission denied
// }
```

With `requestAll()`, both permissions are first requested at once. If the joint request fails, they are requested individually.

---

## Subscriptions

```typescript
// onPermissionChange(type: MediaPermissionType, callback: PermissionChangeCallback): VoidFunction
const unsub = permissions.onPermissionChange('camera', (state: MediaPermissionState) => {
  // state: 'granted' | 'denied' | 'prompt' | 'unknown'
  if (state === 'denied') {
    showMessage('Camera access is blocked. Change it in your browser settings.');
  }
  if (state === 'granted') {
    enableCameraButton();
  }
});

permissions.onPermissionChange('microphone', (state: MediaPermissionState) => {
  micBtn.disabled = state === 'denied';
});

// Unsubscribe
unsub();
```

The subscription uses `PermissionStatus.onchange` — a browser API. On iOS the subscription is not supported (no Permissions API), so the callback is not invoked automatically.

---

## Common scenarios

### Checking before a call

```typescript
const { camera, microphone } = await permissions.checkAll();

if (camera === 'denied' || microphone === 'denied') {
  showSettingsPrompt('Allow camera and microphone access in your browser settings');
  return;
}

if (camera === 'prompt' || microphone === 'prompt') {
  const result = await permissions.requestAll();
  if (!result.camera || !result.microphone) {
    showError('Failed to obtain device access');
    return;
  }
}

// Permissions granted — ready to initialize
await media.initializeMedia();
```

### Reactive UI

```typescript
permissions.onPermissionChange('camera', (state) => {
  cameraBtn.disabled = state === 'denied';
  cameraBtn.title = state === 'denied' ? 'Access blocked' : 'Enable camera';
});

permissions.onPermissionChange('microphone', (state) => {
  micBtn.disabled = state === 'denied';
});
```

---

## iOS helpers

iOS has no standard Permissions API for the camera and microphone. To work with permissions on iOS, use the helper functions from `valm`:

```typescript
import {
  isIOS,
  isIOSSafari,
  isIOSChrome,
  requestIOSMediaPermissions,
} from 'valm-js';
```

### Platform detection

```typescript
isIOS()      // true if the device runs iOS
isIOSSafari() // true if iOS Safari
isIOSChrome() // true if iOS Chrome (WKWebView)
```

### Requesting permissions on iOS

iOS Safari requires a **user gesture** for the first `getUserMedia` call. Call `requestIOSMediaPermissions()` inside a button-click handler:

```typescript
// requestIOSMediaPermissions(): Promise<{ video: boolean; audio: boolean }>
startBtn.addEventListener('click', async () => {
  if (isIOS()) {
    const result = await requestIOSMediaPermissions();
    // {
    //   video: true,  // camera permission granted
    //   audio: true   // microphone permission granted
    // }

    if (!result.video || !result.audio) {
      showError('Failed to obtain permissions. Check your Safari settings.');
      return;
    }
  }

  await media.initializeMedia();
});
```

The function requests a minimal media stream and immediately stops it — solely to obtain permissions from the browser.

### iOS specifics

- `PermissionsService.checkPermission()` automatically uses the `enumerateDevices()` fallback on iOS
- Permission state is inferred from whether devices have a `label` — if a label is present, permission is `'granted'`
- `onPermissionChange()` on iOS does not receive automatic notifications about permission changes

---

## Types

### `MediaPermissionType`

```typescript
type MediaPermissionType = 'camera' | 'microphone'
```

### `MediaPermissionState`

```typescript
type MediaPermissionState =
  | 'granted'   // access allowed
  | 'denied'    // access blocked
  | 'prompt'    // not asked yet
  | 'unknown'   // could not be determined
```

### `MediaPermissions`

```typescript
interface MediaPermissions {
  camera: MediaPermissionState     // camera permission state
  microphone: MediaPermissionState // microphone permission state
}
```

### `PermissionChangeCallback`

```typescript
type PermissionChangeCallback = (state: MediaPermissionState) => void
```

---

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `checkPermission(type)` | `Promise<MediaPermissionState>` | Check a single permission |
| `checkAll()` | `Promise<MediaPermissions>` | Check camera and microphone |
| `requestPermission(type)` | `Promise<boolean>` | Request a single permission |
| `requestAll()` | `Promise<{camera, microphone}>` | Request both permissions |
| `onPermissionChange(type, cb)` | `VoidFunction` | Subscribe to changes |

## iOS helpers API

| Function | Returns | Description |
|----------|---------|-------------|
| `isIOS()` | `boolean` | Detect iOS |
| `isIOSSafari()` | `boolean` | Detect iOS Safari |
| `isIOSChrome()` | `boolean` | Detect iOS Chrome |
| `requestIOSMediaPermissions()` | `Promise<{video, audio}>` | Request permissions (requires a user gesture) |
