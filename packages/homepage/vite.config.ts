import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { DOCS_NAV } from './src/config/docsNav'

// Версия ядра берётся из packages/valm/package.json — единый источник правды,
// чтобы бейдж в шапке не расходился с реально опубликованным пакетом.
const valmPkg = JSON.parse(
  readFileSync(new URL('../valm/package.json', import.meta.url), 'utf-8'),
)

// Все /docs/<slug> из того же источника, что рисует Sidebar и генерит llms.txt —
// чтобы список пререндеренных путей не разъезжался с навигацией.
const docSlugs = DOCS_NAV.flatMap((g) => g.items.map((i) => i.slug))

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
  ssgOptions: {
    entry: 'src/main.tsx',
    // Отключаем «пререндерить все статические роуты»: список задаём вручную ниже,
    // иначе (а) не попадёт динамический /docs/:slug, (б) попадёт /playground.
    includeAllRoutes: false,
    // EN-only пререндер: главная, /docs (дефолтный раздел) и каждый /docs/<slug>.
    // /playground сознательно НЕ включаем — он SPA-only (firebase-rewrite отдаёт
    // shell, клиент домонтирует Playground с его тяжёлыми valm-js/ML-зависимостями).
    includedRoutes: () => ['/', '/docs', ...docSlugs.map((s) => `/docs/${s}`)],
  },
})
