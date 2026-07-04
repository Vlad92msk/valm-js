# Utilities

Вспомогательные инструменты для определения платформы и детекции голоса.

---

## DeviceDetector

Определение платформы и браузера пользователя.

### Доступ

```typescript
import { DeviceDetector } from 'valm-js'
```

`DeviceDetector` — объект-утилита, не требует инстанциирования.

### Определение платформы

```typescript
// isMobile(): boolean
DeviceDetector.isMobile()   // true на смартфонах и планшетах

// isIOS(): boolean
DeviceDetector.isIOS()      // true на iPhone/iPad

// isAndroid(): boolean
DeviceDetector.isAndroid()  // true на Android-устройствах

// isDesktop(): boolean
DeviceDetector.isDesktop()  // true если не мобильное устройство
```

### Определение браузера и возможностей

```typescript
// isSafari(): boolean
DeviceDetector.isSafari()       // true в Safari (desktop и iOS)

// isIOSSafari(): boolean
DeviceDetector.isIOSSafari()    // true только в Safari на iOS

// isIOSChrome(): boolean
DeviceDetector.isIOSChrome()    // true в Chrome на iOS (CriOS)

// isTouchDevice(): boolean
DeviceDetector.isTouchDevice()  // true если есть тачскрин
```

### Пример

```typescript
import { DeviceDetector } from 'valm-js'

if (DeviceDetector.isIOSSafari()) {
  // На iOS Safari нужен user gesture перед первым getUserMedia.
  // Покажи кнопку и вызови requestIOSMediaPermissions() по клику.
} else {
  await media.initializeMedia()
}
```

### iOS Media Helpers

Вспомогательные функции для работы с медиа на iOS — делегируют `DeviceDetector`.

```typescript
import { isIOS, isIOSSafari, isIOSChrome, requestIOSMediaPermissions } from 'valm-js'

// Запросить разрешения на камеру и микрофон на iOS.
// Вызывать в обработчике пользовательского жеста (click, tap) — до initializeMedia().
const result = await requestIOSMediaPermissions()
// result = {
//   video: true,  // разрешение на камеру получено
//   audio: true,  // разрешение на микрофон получено
// }
```

### API-таблица

| Метод | Возвращает | Описание |
|---|---|---|
| `isMobile()` | `boolean` | Мобильное устройство (по UA, тачскрину и размеру экрана) |
| `isIOS()` | `boolean` | iPhone / iPad |
| `isAndroid()` | `boolean` | Android-устройство |
| `isDesktop()` | `boolean` | Не мобильное устройство |
| `isTouchDevice()` | `boolean` | Есть тачскрин |
| `isSafari()` | `boolean` | Safari-браузер |
| `isIOSSafari()` | `boolean` | Safari на iOS |
| `isIOSChrome()` | `boolean` | Chrome на iOS (CriOS) |

---

## VoiceActivityDetector

Детектирует голосовую активность в аудиопотоке через Web Audio API. Используется внутри `MicrophoneController`, но можно применять самостоятельно с любым `MediaStreamTrack`.

### Доступ

```typescript
import { VoiceActivityDetector } from 'valm-js'

const vad = new VoiceActivityDetector({
  volumeThreshold: 20,  // уровень громкости, выше которого считается речь (0-100)
  silenceTimeout: 800,  // мс тишины, после которых isSpeaking становится false
})
```

### Конфигурация

```typescript
interface VoiceActivityConfig {
  volumeThreshold: number   // Порог громкости для определения речи (0-100)
  silenceTimeout: number    // Через сколько мс тишины считаем что перестал говорить

  fftSize?: number          // Размер FFT-блока: 256 (по умолчанию) или 512 — больше = точнее, но медленнее
  updateInterval?: number   // Интервал обновления анализа в мс (по умолчанию 100)
  smoothingFactor?: number  // Сглаживание уровня громкости 0-1 (по умолчанию 0.2; ближе к 1 — плавнее, медленнее реагирует)
}
```

### Управление

```typescript
// start(track: MediaStreamTrack): void
// Запустить анализ. Ничего не делает если трек выключен (track.enabled = false).
vad.start(audioTrack)

// stop(): void
// Остановить анализ и освободить AudioContext.
vad.stop()

// updateConfig(newConfig: Partial<VoiceActivityConfig>): void
// Обновить параметры на лету без перезапуска.
vad.updateConfig({ volumeThreshold: 30 })
```

### Подписки

```typescript
// onStateChange(callback): VoidFunction
const unsubscribe = vad.onStateChange((state) => {
  // state = {
  //   volume: 42,        // текущий уровень громкости (0-100, сглаженный)
  //   isSpeaking: true,  // true если volume > volumeThreshold
  // }
  console.log(`Volume: ${state.volume}, Speaking: ${state.isSpeaking}`)
})

// Отписаться
unsubscribe()
```

Callback вызывается только при реальном изменении состояния: сменился `isSpeaking` или уровень громкости изменился более чем на 1 единицу.

### Полный пример

```typescript
import { VoiceActivityDetector } from 'valm-js'

const vad = new VoiceActivityDetector({
  volumeThreshold: 15,
  silenceTimeout: 1000,
  smoothingFactor: 0.3,
})

const unsubscribe = vad.onStateChange((state) => {
  // state = {
  //   volume: 28,       // сглаженный уровень громкости (0-100)
  //   isSpeaking: true, // говорит ли пользователь прямо сейчас
  // }
  updateVolumeIndicator(state.volume)

  if (state.isSpeaking) {
    showSpeakingIndicator()
  } else {
    hideSpeakingIndicator()
  }
})

// Передать аудиотрек
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
vad.start(stream.getAudioTracks()[0])

// При очистке
unsubscribe()
vad.stop()
```

### API-таблица

| Метод | Параметры | Возвращает | Описание |
|---|---|---|---|
| `start(track)` | `MediaStreamTrack` | `void` | Запустить анализ аудиотрека |
| `stop()` | — | `void` | Остановить анализ, освободить AudioContext |
| `updateConfig(config)` | `Partial<VoiceActivityConfig>` | `void` | Обновить параметры без перезапуска |
| `onStateChange(callback)` | `(state: VoiceActivityState) => void` | `VoidFunction` | Подписка на изменения состояния |
