import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Непрерывный тон (WAV) вместо пульсирующего фейкового тона Chromium — даёт
// детерминированную ненулевую громкость для тестов VAD / детекции речи.
const toneWav = fileURLToPath(new URL('./e2e/fixture/assets/tone.wav', import.meta.url))

// Флаги Chromium для фейковых медиа-устройств:
//  --use-fake-device-for-media-stream — синтетическая камера (движущийся паттерн) + микрофон (тон)
//  --use-fake-ui-for-media-stream     — авто-грант разрешений камеры/микрофона (без диалога)
//  --auto-select-desktop-capture-source — авто-выбор источника для getDisplayMedia
const chromiumMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--auto-select-desktop-capture-source=Entire screen',
  // effects тянет MediaPipe WASM — включаем нужное для WebGL в headless
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  // AudioContext должен стартовать без user-gesture, иначе VAD/детекция громкости
  // читают тишину (context остаётся suspended) — тесты аудио становятся флаки
  '--autoplay-policy=no-user-gesture-required',
  // Подаём непрерывный громкий тон вместо пульсирующего дефолтного — стабильная громкость
  `--use-file-for-fake-audio-capture=${toneWav}`,
]

export default defineConfig({
  testDir: './e2e',
  // effects (MediaPipe WASM) грузятся из сети/диска — держим щедрый таймаут
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: {
      args: chromiumMediaArgs,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'vite --config e2e/fixture/vite.config.ts --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
