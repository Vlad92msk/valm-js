import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Head } from 'vite-react-ssg'

import styles from './DocsPage.module.scss'
import { makeCn } from '../../utils/makeCn'
import Sidebar from '../../components/sidebar/Sidebar'
import MarkdownRenderer from '../../components/markdown-renderer/MarkdownRenderer'
import { getGroupKey, getDocTitle } from '../../config/docsNav'

const cn = makeCn('DocsPage', styles)

const SITE = 'https://valm-js.web.app'

const ArrowLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('footerIcon')} aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('footerIcon')} aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const DocsPage = () => {
  const { slug: rawSlug } = useParams<{ slug: string }>()
  const { t } = useTranslation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const handleOpenSidebar = () => setIsSidebarOpen(true)
  const handleCloseSidebar = () => setIsSidebarOpen(false)

  // `/docs` без раздела → дефолтный getting-started (пререндерится с контентом
  // и полным сайдбаром). Терпим хвостовой `.md` (напр. /docs/events.md).
  const slug = (rawSlug ?? 'getting-started').replace(/\.md$/i, '')
  const groupKey = getGroupKey(slug)

  return (
    <div className={cn()}>
      {/* Per-page title + canonical (иначе один общий на все разделы). Canonical
          на /docs указывает на /docs/getting-started, чтобы не плодить дубли. */}
      <Head>
        <title>{`${getDocTitle(slug)} · valm`}</title>
        <link rel="canonical" href={`${SITE}/docs/${slug}`} />
      </Head>

      <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

      <main className={cn('main')}>
        <button
          type="button"
          className={cn('menuBtn')}
          onClick={handleOpenSidebar}
          aria-label={t('docs.openNav')}
        >
          ☰
        </button>

        <div className={cn('inner')}>
          {groupKey && (
            <div className={cn('overline')}>{t(`sidebar.groups.${groupKey}`)}</div>
          )}

          {slug && <MarkdownRenderer slug={slug} />}

          <div className={cn('footer')}>
            <Link to="/" className={cn('footerLink')}>
              <ArrowLeftIcon />
              {t('docs.backHome')}
            </Link>
            <Link to="/playground" className={cn('footerLink', { accent: true })}>
              {t('docs.openPlayground')}
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DocsPage
