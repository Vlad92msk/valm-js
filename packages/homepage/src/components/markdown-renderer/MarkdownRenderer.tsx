import { useState, useEffect, isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import rehypeSlug from 'rehype-slug'

import styles from './MarkdownRenderer.module.scss'
import { makeCn } from '../../utils/makeCn'
import { getHighlighter } from '../../lib/highlighter'
import '../../styles/markdown.css'

const cn = makeCn('MarkdownRenderer', styles)

// Убирает хвостовой `.md` у slug — чтобы и прямой заход на `/docs/events.md`,
// и внутренние ссылки вида `./events.md` резолвились в существующий документ.
const normalizeSlug = (slug: string): string => slug.replace(/\.md$/i, '')

// Ссылки внутри markdown. Внутренние (на другие гайды) ведём через react-router,
// без полной перезагрузки; внешние — обычным <a> в новой вкладке.
const DocLink = ({ href, children }: { href?: string; children?: ReactNode }) => {
  if (!href || /^(https?:)?\/\//i.test(href) || /^(mailto:|tel:)/i.test(href)) {
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>
  }
  if (href.startsWith('#')) {
    return <a href={href}>{children}</a>
  }
  // ./events.md, events.md, /docs/events, ../guides/events.md → /docs/events(#hash)
  const [path, hash] = href.split('#')
  const slug = normalizeSlug(path.replace(/^.*\//, ''))
  const to = `/docs/${slug}${hash ? `#${hash}` : ''}`
  return <Link to={to}>{children}</Link>
}

// Гайды разложены по языковым папкам (guides/ru, guides/en). Грузим все тела
// СИНХРОННО на этапе сборки (eager) — тогда контент доступен прямо во время
// рендера, и SSG-пререндер зашивает его в статический HTML (без «Loading…»).
const guideModules = import.meta.glob<string>('@guides/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const DEFAULT_DOC_LANG = 'ru'

// Тело гайда для конкретного языка и slug (по суффиксу пути), либо undefined.
const findGuide = (lang: string, slug: string): string | undefined => {
  const suffix = `/${lang}/${normalizeSlug(slug)}.md`
  const key = Object.keys(guideModules).find((k) => k.endsWith(suffix))
  return key ? guideModules[key] : undefined
}

interface CodeFrameProps {
  code: string
  lang?: string
  children: ReactNode
}

// Оформление блока кода «как в macOS»: шапка с тремя точками, меткой языка и
// кнопкой копирования, ниже — само тело кода (подсвеченное Shiki или plain <pre>).
const CodeFrame = ({ code, lang, children }: CodeFrameProps) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={cn('codeBlock')}>
      <div className={cn('codeBar')}>
        <span className={cn('dot', { color: 'red' })} />
        <span className={cn('dot', { color: 'yellow' })} />
        <span className={cn('dot', { color: 'green' })} />
        {lang && <span className={cn('lang')}>{lang}</span>}
        <button
          className={cn('copyBtn', { copied })}
          onClick={handleCopy}
          aria-label={t('docs.copyAria')}
        >
          {copied ? t('docs.copied') : t('docs.copy')}
        </button>
      </div>
      <div className={cn('codeBody')}>{children}</div>
    </div>
  )
}

interface ShikiBlockProps {
  lang: string
  code: string
}

const ShikiBlock = ({ lang, code }: ShikiBlockProps) => {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    getHighlighter().then(hl => {
      if (!cancelled) {
        const stripPreStyle = (h: string) => h.replace(/<pre([^>]*?) style="[^"]*"/, '<pre$1')
        try {
          setHtml(stripPreStyle(hl.codeToHtml(code, { lang, theme: 'material-theme-ocean' })))
        } catch {
          setHtml(stripPreStyle(hl.codeToHtml(code, { lang: 'text', theme: 'material-theme-ocean' })))
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  return (
    <CodeFrame code={code} lang={lang}>
      {html
        ? <div dangerouslySetInnerHTML={{ __html: html }} />
        : <pre><code>{code}</code></pre>
      }
    </CodeFrame>
  )
}

const markdownComponents = {
  a: DocLink,
  pre: ({ children }: { children?: ReactNode }) => {
    if (isValidElement<{ className?: string }>(children) && children.props.className?.startsWith('language-')) {
      return <>{children}</>
    }
    const text = isValidElement<{ children?: ReactNode }>(children)
      ? String(children.props.children ?? '')
      : ''
    return (
      <CodeFrame code={text}>
        <pre>{children}</pre>
      </CodeFrame>
    )
  },
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const match = /language-(\w+)/.exec(className ?? '')
    const lang = match?.[1]
    if (lang) return <ShikiBlock lang={lang} code={String(children).trimEnd()} />
    return <code>{children}</code>
  },
}

interface MarkdownRendererProps {
  slug: string
}

const MarkdownRenderer = ({ slug }: MarkdownRendererProps) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  // Контент выбирается синхронно из eager-глоба: сначала на активном языке,
  // иначе — на дефолтном (перевода может ещё не быть). Никаких async/loading —
  // текст присутствует уже в первом рендере, поэтому попадает в пререндер.
  const content = useMemo(
    () => findGuide(lang, slug) ?? findGuide(DEFAULT_DOC_LANG, slug) ?? null,
    [slug, lang],
  )

  if (content === null) return <p className={cn('message')}>{t('docs.notFound')}</p>

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective]}
        rehypePlugins={[rehypeSlug]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
