// Пост-билд-гард: убеждаемся, что SSG реально зашил контент разделов в HTML,
// а не выложил пустой каркас. Падает (exit 1) — билд считается сломанным.
//
// vite-react-ssg кладёт файлы «плоско»: /docs/camera → dist/docs/camera.html
// (firebase cleanUrls:true отдаёт их как /docs/camera). Главная → dist/index.html,
// /docs → dist/docs.html.
//
// Для каждого /docs/<slug> проверяем:
//   1) есть файл dist/docs/<slug>.html;
//   2) в нём присутствует заголовок раздела (H1 из guides/en/<slug>.md) —
//      значит контент отрендерился, а не остался пустой каркас;
//   3) есть настоящие ссылки href="/docs/… — значит агент/краулер обойдёт по ним
//      всю документацию с любой страницы.
// Плюс проверяем главную (/) и /docs.
//
// Источник списка разделов — тот же src/config/docsNav.ts, что и у навигации/llms.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOMEPAGE_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const REPO_ROOT = path.resolve(HOMEPAGE_ROOT, '..', '..')
const DIST = path.join(HOMEPAGE_ROOT, 'dist')
const GUIDES_DIR = path.join(REPO_ROOT, 'guides', 'en')
const NAV_FILE = path.join(HOMEPAGE_ROOT, 'src', 'config', 'docsNav.ts')

/** Slugs из docsNav.ts в порядке появления (текстовый парс, без сборки TS). */
function readSlugs() {
  const src = fs.readFileSync(NAV_FILE, 'utf8')
  const slugs = []
  const re = /slug:\s*'([^']+)'/g
  let m
  while ((m = re.exec(src)) !== null) slugs.push(m[1])
  return slugs
}

/** Первый H1 в guides/en/<slug>.md — маркер реального контента. */
function guideTitle(slug) {
  const file = path.join(GUIDES_DIR, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null
}

// Минимальное HTML-экранирование, чтобы искать заголовок в отрендеренном HTML
// (react-markdown кодирует & < > в тексте).
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const errors = []

// Плоский путь файла для URL-роута: '' → index.html, 'docs' → docs.html,
// 'docs/camera' → docs/camera.html.
const fileFor = (route) => path.join(DIST, `${route === '' ? 'index' : route}.html`)

function checkPage(route, { marker, needsDocLinks }) {
  const rel = `${route === '' ? 'index' : route}.html`
  const file = fileFor(route)
  if (!fs.existsSync(file)) {
    errors.push(`нет файла: dist/${rel}`)
    return
  }
  const html = fs.readFileSync(file, 'utf8')
  // Комментарии выкидываем, чтобы литералы вроде «Head» в поясняющем тексте
  // index.html не считались реальными тегами.
  const clean = html.replace(/<!--[\s\S]*?-->/g, '')
  if (marker && !clean.includes(esc(marker))) {
    errors.push(`dist/${rel} не содержит заголовок раздела «${marker}» (пустой каркас?)`)
  }
  if (needsDocLinks && !/href="\/docs\//.test(clean)) {
    errors.push(`dist/${rel} без ссылок href="/docs/… (навигация не пререндерилась?)`)
  }
  // Ровно один <title> — иначе статический шаблонный + из <Head> дублируются.
  const titles = (clean.match(/<title[\s>]/g) || []).length
  if (titles !== 1) {
    errors.push(`dist/${rel} содержит ${titles} <title> (ожидался 1)`)
  }
}

const slugs = readSlugs()

// Главная и /docs — точки входа для агента (должны нести ссылки на разделы).
checkPage('', { needsDocLinks: true })
checkPage('docs', { needsDocLinks: true })

for (const slug of slugs) {
  const title = guideTitle(slug)
  if (!title) {
    errors.push(`guides/en/${slug}.md без H1 — нечем проверить контент`)
    continue
  }
  checkPage(`docs/${slug}`, { marker: title, needsDocLinks: true })
}

if (errors.length) {
  console.error(`\n❌ check-prerender: ${errors.length} проблем(ы):`)
  for (const e of errors) console.error(`   • ${e}`)
  process.exit(1)
}

console.log(`\n✅ check-prerender: ${slugs.length} разделов + / + /docs пререндерены с контентом`)
