import { useState, useEffect, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import rehypeSlug from 'rehype-slug'

import styles from './MarkdownRenderer.module.scss'
import { makeCn } from '../../utils/makeCn'
import { getHighlighter } from '../../lib/highlighter'
import '../../styles/markdown.css'

const cn = makeCn('MarkdownRenderer', styles)

const GUIDE_TITLES: Record<string, string> = {
  'getting-started': 'Getting Started',
  'camera': 'Camera',
  'microphone': 'Microphone',
  'screen-share': 'Screen Share',
  'devices': 'Devices',
  'permissions': 'Permissions',
  'configuration': 'Configuration',
  'effects': 'Effects',
  'custom-effects': 'Custom Effects',
  'events': 'Events',
  'plugins': 'Plugins',
  'recording': 'Recording',
  'transcription': 'Transcription',
  'utilities': 'Utilities',
}

const guideModules = import.meta.glob<string>('@guides/*.md', {
  query: '?raw',
  import: 'default',
})

interface CodeBlockProps {
  code: string
  children: ReactNode
}

const CodeBlock = ({ code, children }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={cn('codeBlock')}>
      {children}
      <button
        className={cn('copyBtn', { copied })}
        onClick={handleCopy}
        aria-label="Копировать код"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
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
    <CodeBlock code={code}>
      {html
        ? <div dangerouslySetInnerHTML={{ __html: html }} />
        : <pre><code>{code}</code></pre>
      }
    </CodeBlock>
  )
}

const markdownComponents = {
  pre: ({ children }: { children?: ReactNode }) => {
    if (isValidElement<{ className?: string }>(children) && children.props.className?.startsWith('language-')) {
      return <>{children}</>
    }
    const text = isValidElement<{ children?: ReactNode }>(children)
      ? String(children.props.children ?? '')
      : ''
    return (
      <CodeBlock code={text}>
        <pre>{children}</pre>
      </CodeBlock>
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
  onContent?: (content: string) => void
}

const MarkdownRenderer = ({ slug, onContent }: MarkdownRendererProps) => {
  const [content, setContent] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const keys = Object.keys(guideModules)
    const key = keys.find(k => k.endsWith(`/${slug}.md`))

    if (!key) {
      setNotFound(true)
      setContent(null)
      onContent?.('')
      return
    }

    setContent(null)
    setNotFound(false)
    guideModules[key]().then(text => {
      setContent(text)
      onContent?.(text)
    })
  }, [slug, onContent])

  const title = GUIDE_TITLES[slug] ?? slug

  return (
    <div className={cn()}>
      <nav className={cn('breadcrumbs')} aria-label="breadcrumb">
        <span className={cn('breadcrumb')}>Документация</span>
        <span className={cn('sep')}>/</span>
        <span className={cn('breadcrumb', { current: true })}>{title}</span>
      </nav>
      {notFound ? (
        <p className={cn('message')}>Страница не найдена.</p>
      ) : content === null ? (
        <p className={cn('message')}>Загрузка…</p>
      ) : (
        <div className="markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkDirective]}
            rehypePlugins={[rehypeSlug]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default MarkdownRenderer
