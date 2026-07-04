import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// VALM_SOURCE=src  → тестируем сырой src (быстро, для разработки)
// VALM_SOURCE=dist → тестируем собранный пакет (по умолчанию; ловит проблемы сборки/экспортов)
const useSrc = process.env.VALM_SOURCE === 'src'

const resolve = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  root: resolve('.'),
  // Отдаём локальные MediaPipe WASM + модели (те же, что использует homepage) по пути
  // /mediapipe/... — это дефолтные wasmPath/modelPath провайдеров эффектов. Так effects
  // грузятся офлайн, без обращения к CDN.
  publicDir: resolve('../../../homepage/public'),
  resolve: {
    alias: {
      '@valm/audio-effects': useSrc ? resolve('../../src/audio-effects/index.ts') : resolve('../../dist/audio-effects.js'),
      '@valm/effects': useSrc ? resolve('../../src/effects/index.ts') : resolve('../../dist/effects.js'),
      '@valm': useSrc ? resolve('../../src/index.ts') : resolve('../../dist/index.js'),
    },
  },
  server: {
    fs: {
      // Разрешаем vite отдавать файлы из корня пакета (dist/, src/, node_modules/)
      allow: [resolve('../..')],
    },
  },
})
