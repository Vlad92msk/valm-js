# Changelog

## 2.1.0 - 2026-10-13

### Changed

- Switching the camera while the video effects pipeline is running is now seamless: only the pipeline input is swapped, the output track stays the same and `onTrackReplaced` is not emitted (no `replaceTrack` on the SFU side). Applies to `switchDevice`, `reacquire`, `toggleFacing` and automatic returns after a fallback. If you used `onTrackReplaced` to detect a camera change, use `onStateChange` (`deviceId`) instead. When the pipeline is not running, behaviour is unchanged.

### Fixed

- `toggleFacing()` rolls back `facingMode` and `deviceId` in the configuration when the switch fails.

### Added

- `cameraController.toggleFacing()` returns `FacingResult { applied, deviceId, facingMode, reason? }` instead of `void`. `applied: false, reason: 'noop'` means the browser reopened the same camera (cameras without a facing mode, e.g. a laptop or an external webcam); `deviceId` is the camera that is actually open.
- `new Valm(config)` accepts partial sections (`{ video: { enabled: false } }` now type-checks); missing fields come from the defaults, as they already did at runtime.
- `IVideoProcessingPipeline.switchInput(track)` (optional). A custom pipeline without it is restarted on a camera switch, as before.

## 2.0.0 - 2026-09-26

Device switching and device loss, found while integrating Valm into a video-call client.

### Breaking / behaviour changes

- `microphoneController.switchDevice()` now waits for the track to actually be replaced and rejects on failure (same contract as the camera). Calls without `await`/`catch` may now produce an unhandled rejection.
- `switchDevice()` (camera and microphone) returns `SwitchResult { applied, deviceId, reason?: 'noop' | 'superseded' | 'disabled' }` instead of `void` and accepts `null` (system device).
- `audioOutputController.setOutputDevice()` returns `Promise<boolean>`: `false` (plus `onError`) for an unknown id or when `setSinkId` failed on every element, instead of silently resolving. `null`/`'default'` select the system output.
- `DevicesState` has a new required `defaults` field.
- `onDeviceDisconnected` no longer fires for the virtual `'default'` device or on `getAvailable()`; it fires once per disconnection, also when the track ended before `devicechange`.
- `AudioOutputState` gained `preferredDeviceId` and `isFallback`.
- `autoSelectSpeakerphone()` no longer picks an arbitrary device when no label matches.

### Fixed

- Failed camera switch with a video effect no longer freezes the published video: the new camera is opened before the effect pipeline is stopped. A pipeline start error falls back to the raw track and emits an error.
- Soft mute is preserved when the microphone is switched (no more "hot mic" after a switch).
- A failed switch rolls back `deviceId` in the configuration, so the next `enable()` works.
- Mobile camera switch: on failure Valm reopens the previous camera or turns the camera off consistently.
- Camera mute survives enabling/disabling video effects.
- `microphone.enable(id)` on an enabled microphone performs one switch instead of two; `camera.enable(id)` on an enabled camera switches the device.
- Microphone errors are no longer delivered to `cameraController.onError` (and vice versa).
- The system audio output is passed to `setSinkId` as `''`, so "Default" works in Firefox and Safari.

### Added

- `deviceFallback: 'none' | 'default'` (audio and video config) and `onDeviceFallback`: open the system device when the chosen one is missing, return to it when it is plugged back in.
- `switchDevice(id, { force: true })` and `reacquire()`; `devicesController.onDefaultDeviceChanged`; `audio.followSystemDefault`.
- `onSourceMuteChange`, `state.isSourceMuted` and `sourceMuteDebounceMs` (camera and microphone).
- `onTrackEnded({ reason: 'device-lost' | 'ended' })`; with `deviceFallback: 'default'` a lost device is replaced by the system one automatically.
- `isMuted` in `onTrackReplaced` events.
- `audioOutputController.onError`, `onDeviceLost`.
- README: "SFU integration" section.
