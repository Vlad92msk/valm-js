// Генерирует машиночитаемую документацию для AI-агентов и поисковых систем:
//
//   public/llms.txt      — компактный индекс по стандарту https://llmstxt.org:
//                          заголовок, краткое описание, ссылки на страницы docs.
//   public/llms-full.txt — вся англоязычная документация одним файлом, чтобы
//                          модель могла проглотить её целиком без обхода сайта.
//   public/sitemap.xml    — карта сайта для поисковых краулеров.
//
// Единственный источник правды по составу и порядку — src/config/docsNav.ts
// (та же структура, что рисует Sidebar), поэтому файлы не разъезжаются с сайтом.
// Тела берутся из guides/en/*.md, обзор — из packages/valm/README.md.
//
// Запуск: node scripts/generate-llms.mjs (встроен в yarn dev / yarn build).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOMEPAGE_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const REPO_ROOT = path.resolve(HOMEPAGE_ROOT, '..', '..')
const GUIDES_DIR = path.join(REPO_ROOT, 'guides', 'en')
const README = path.join(REPO_ROOT, 'packages', 'valm', 'README.md')
const NAV_FILE = path.join(HOMEPAGE_ROOT, 'src', 'config', 'docsNav.ts')
const OUT_DIR = path.join(HOMEPAGE_ROOT, 'public')

const SITE = 'https://valm-js.web.app'
const NPM = 'https://www.npmjs.com/package/valm-js'
const GITHUB = 'https://github.com/Vlad92msk/valm-js'

// Английские ярлыки групп — зеркало sidebar.groups из src/i18n/locales/en.ts.
// `more` — служебная группа для гайдов, которых ещё нет в docsNav.ts.
const GROUP_LABELS = {
    start: 'Getting Started',
    core: 'Core',
    effects: 'Effects',
    advanced: 'Advanced',
    more: 'More',
}

const DESCRIPTION =
    'TypeScript library for managing local media streams in the browser: camera, microphone, ' +
    'screen share, recording, speech-to-text transcription, and video effects (background blur / ' +
    'virtual background). One framework-agnostic API over MediaStream, with a plugin system that ' +
    'keeps heavy ML dependencies optional. npm package: `valm-js`.'

const EMOJI = /[\p{Extended_Pictographic}\u{2600}-\u{27BF}\u{FE0F}]/gu

/**
 * Разбирает src/config/docsNav.ts и возвращает упорядоченный список
 * { slug, title, group } — ровно в том порядке, в каком его рисует Sidebar.
 * Парсим текстом (а не импортом), чтобы не тянуть tsx/сборку в скрипт.
 */
function readNav() {
    const src = fs.readFileSync(NAV_FILE, 'utf8')

    // Позиции объявлений групп: key: 'start' | 'core' | ...
    const groups = []
    const groupRe = /key:\s*'([^']+)'/g
    let m
    while ((m = groupRe.exec(src)) !== null) {
        groups.push({ key: m[1], index: m.index })
    }

    // Все пары slug/title в порядке появления; каждую относим к ближайшей
    // предшествующей группе.
    const items = []
    const itemRe = /slug:\s*'([^']+)',\s*title:\s*'([^']+)'/g
    while ((m = itemRe.exec(src)) !== null) {
        const at = m.index
        let group = groups[0]?.key ?? 'more'
        for (const g of groups) {
            if (g.index < at) group = g.key
            else break
        }
        items.push({ slug: m[1], title: m[2], group })
    }

    return items
}

/** Первый абзац-описание из тела markdown (заголовок H1 пропускается). */
function extractSummary(body) {
    const lines = body.split('\n')
    let inFence = false
    let seenH1 = false
    const paragraph = []
    for (const raw of lines) {
        const line = raw.trim()
        if (line.startsWith('```')) {
            inFence = !inFence
            continue
        }
        if (inFence) continue
        if (!seenH1) {
            if (line.startsWith('# ')) seenH1 = true
            continue
        }
        const isSkippable =
            line.startsWith('#') ||
            line.startsWith('>') ||
            line.startsWith('|') ||
            line.startsWith('-') ||
            line.startsWith('*') ||
            line.startsWith(':::') ||
            /^\d+\./.test(line)
        // Копим строки одного абзаца (markdown переносит длинные абзацы),
        // пока не встретим пустую строку или конец абзаца.
        if (paragraph.length) {
            if (!line || isSkippable) break
            paragraph.push(line)
            continue
        }
        if (!line || isSkippable) continue
        paragraph.push(line)
    }
    return paragraph.length ? cleanSummary(paragraph.join(' ')) : ''
}

function cleanSummary(text) {
    let s = text
        .replace(EMOJI, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // ссылки → текст
        .replace(/[*`_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const dot = s.indexOf('. ')
    if (dot > 40) s = s.slice(0, dot + 1)
    if (s.length > 200) s = s.slice(0, 197).trimEnd() + '…'
    return s
}

/** Заголовок документа: первый H1 в теле (fallback — переданный). */
function extractTitle(body, fallback) {
    const h1 = body.match(/^#\s+(.+)$/m)?.[1]
    return (h1 || fallback).replace(EMOJI, '').replace(/\s+/g, ' ').trim()
}

/**
 * Переписывает относительные ссылки на другие гайды (./events.md, effects.md#x)
 * в абсолютные URL сайта, чтобы агент мог по ним пройти из llms-full.txt.
 */
function absolutizeLinks(body) {
    return body.replace(/\]\((\.{0,2}\/)?([\w-]+)\.md(#[^)]*)?\)/g, (_all, _rel, name, hash) => {
        return `](${SITE}/docs/${name}${hash ?? ''})`
    })
}

function readGuide(slug) {
    const file = path.join(GUIDES_DIR, `${slug}.md`)
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file, 'utf8').trim()
}

function build() {
    const nav = readNav()
    const covered = new Set(nav.map((n) => n.slug))

    // Гайды, которых ещё нет в навигации, добавляем в конец под группой «More»,
    // чтобы агенты видели полную документацию.
    const orphanFiles = fs
        .readdirSync(GUIDES_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .filter((slug) => !covered.has(slug))
        .sort()

    const entries = []
    for (const { slug, title, group } of nav) {
        const body = readGuide(slug)
        if (body == null) {
            console.warn(`⚠️  guides/en/${slug}.md не найден — пропущен`)
            continue
        }
        entries.push({ slug, group, title, summary: extractSummary(body), body })
    }
    for (const slug of orphanFiles) {
        const body = readGuide(slug)
        entries.push({
            slug,
            group: 'more',
            title: extractTitle(body, slug),
            summary: extractSummary(body),
            body,
        })
    }

    if (orphanFiles.length) {
        console.warn(
            `ℹ️  Гайды вне docsNav.ts (добавлены в группу «More»): ${orphanFiles.join(', ')}`,
        )
    }

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

    writeIndex(entries)
    writeFull(entries)
    writeSitemap(entries)

    console.log(`\n✅ Сгенерировано ${entries.length} записей`)
    for (const f of ['llms.txt', 'llms-full.txt', 'sitemap.xml']) {
        console.log(`   📄 public/${f}`)
    }
}

/** Компактный индекс llms.txt. */
function writeIndex(entries) {
    const lines = []
    lines.push('# valm')
    lines.push('')
    lines.push(`> ${DESCRIPTION}`)
    lines.push('')
    lines.push(`- Homepage: ${SITE}`)
    lines.push(`- Docs: ${SITE}/docs`)
    lines.push(`- npm: ${NPM}`)
    lines.push(`- GitHub: ${GITHUB}`)
    lines.push(`- Full documentation as one file: ${SITE}/llms-full.txt`)
    lines.push('')

    // Группируем в порядке появления групп.
    const order = []
    const byGroup = new Map()
    for (const e of entries) {
        if (!byGroup.has(e.group)) {
            byGroup.set(e.group, [])
            order.push(e.group)
        }
        byGroup.get(e.group).push(e)
    }

    for (const group of order) {
        lines.push(`## ${GROUP_LABELS[group] ?? group}`)
        lines.push('')
        for (const e of byGroup.get(group)) {
            const url = `${SITE}/docs/${e.slug}`
            lines.push(`- [${e.title}](${url})${e.summary ? `: ${e.summary}` : ''}`)
        }
        lines.push('')
    }

    fs.writeFileSync(path.join(OUT_DIR, 'llms.txt'), lines.join('\n').trimEnd() + '\n')
}

/** Полная документация одним файлом llms-full.txt. */
function writeFull(entries) {
    const parts = []
    parts.push('# valm — full documentation')
    parts.push('')
    parts.push(
        `Source: ${SITE}/docs · npm: valm-js · GitHub: ${GITHUB} · Generated: ${new Date()
            .toISOString()
            .slice(0, 10)}`,
    )
    parts.push('')
    parts.push('---')
    parts.push('')

    // Обзор из README пакета — самый компактный вход в API.
    if (fs.existsSync(README)) {
        const readme = absolutizeLinks(fs.readFileSync(README, 'utf8').trim())
        parts.push(`<!-- source: packages/valm/README.md · url: ${GITHUB} -->`)
        parts.push(readme)
        parts.push('')
        parts.push('---')
        parts.push('')
    }

    for (const e of entries) {
        parts.push(
            `<!-- source: guides/en/${e.slug}.md · url: ${SITE}/docs/${e.slug} -->`,
        )
        parts.push(absolutizeLinks(e.body))
        parts.push('')
        parts.push('---')
        parts.push('')
    }

    fs.writeFileSync(path.join(OUT_DIR, 'llms-full.txt'), parts.join('\n').trimEnd() + '\n')
}

/** Карта сайта sitemap.xml. */
function writeSitemap(entries) {
    const today = new Date().toISOString().slice(0, 10)
    const url = (loc, priority, changefreq = 'monthly') =>
        [
            '    <url>',
            `        <loc>${loc}</loc>`,
            `        <lastmod>${today}</lastmod>`,
            `        <changefreq>${changefreq}</changefreq>`,
            `        <priority>${priority}</priority>`,
            '    </url>',
        ].join('\n')

    const urls = [
        url(`${SITE}/`, '1.0', 'weekly'),
        url(`${SITE}/docs`, '0.9', 'weekly'),
        url(`${SITE}/playground`, '0.7'),
        ...entries.map((e) => url(`${SITE}/docs/${e.slug}`, '0.8')),
    ]

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '',
        urls.join('\n'),
        '',
        '</urlset>',
        '',
    ].join('\n')

    fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml)
}

build()
