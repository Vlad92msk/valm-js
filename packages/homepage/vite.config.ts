import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Версия ядра берётся из packages/valm/package.json — единый источник правды,
// чтобы бейдж в шапке не расходился с реально опубликованным пакетом.
const valmPkg = JSON.parse(
  readFileSync(new URL('../valm/package.json', import.meta.url), 'utf-8'),
)

export default defineConfig({
  define: {
    __VALM_VERSION__: JSON.stringify(valmPkg.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@guides': new URL('../../guides', import.meta.url).pathname,
    },
  },
})
