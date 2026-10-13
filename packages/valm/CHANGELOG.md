# Changelog

## 2.1.1 - 2026-10-13

Transcription, found while adding live captions to a video-call client.

### Behaviour changes

- Recognition pauses while the microphone is muted (`transcription.pauseOnMute`, default `true`) and resumes on unmute. Nothing said while muted is delivered. Set `pauseOnMute: false` for the old behaviour.
- Turning the microphone off (or losing the device) pauses recognition instead of stopping it; it resumes when the microphone is back, with or without `autoStart`. `state.isActive` stays `true` in between, `state.status` is `'paused'`.
- `aborted` (another tab or site took the browser's recognition session) stops recognition with `stopReason: 'aborted'` instead of restarting every 100 ms.
- `network` and other non-fatal errors are retried with a growing delay (1 s → 30 s, reset after the first result) instead of every 100 ms. Silence (`no-speech`) still restarts right away.
- `onError` for a recognition error now has `action: 'session'` (was `undefined`).

### Fixed

- `stop()` followed by `start()` no longer breaks recognition: a late `onend` of the old session touched the new one, left it running and reported `isActive: false`.
- `onStateChange` fires when recognition stops on an error. Before, `isActive` became `false` silently.
- `configurationController.updateTranscriptionConfig({ language })` restarts an active session, as `updateLanguage()` does. The same for `interimResults`.
- A failed `start()` no longer keeps the unstarted recognition instance.

### Added

- `TranscriptionState.status` (`'idle' | 'starting' | 'listening' | 'restarting' | 'paused'`) and `stopReason` (`'manual' | 'aborted' | 'error' | null`).
- `transcriptionController.onTranscriptEvent(cb)`: one recognition event as `{ final, interim, items, timestamp }`. Chrome often puts several results into one event; `onTranscript` delivers them one by one.
- `TranscriptItem.resultIndex`.
- `MediaErrorEvent.code` — the Web Speech API error code for transcription errors.
- Exported types: `TranscriptItem`, `TranscriptEvent`, `TranscriptionStatus`, `TranscriptionStopReason`, `TranscriptionErrorCode`.

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
