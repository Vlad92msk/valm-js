import { useState } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../../assets/logo.svg'
import styles from './DocsPage.module.scss'
import { makeCn } from '../../utils/makeCn'
import Sidebar from '../../components/sidebar/Sidebar'
import MarkdownRenderer from '../../components/markdown-renderer/MarkdownRenderer'
import TableOfContents from '../../components/table-of-contents/TableOfContents'

const cn = makeCn('DocsPage', styles)

const DocsPage = () => {
  const { slug } = useParams<{ slug: string }>()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [tocContent, setTocContent] = useState('')

  const handleOpenSidebar = () => setIsSidebarOpen(true)
  const handleCloseSidebar = () => setIsSidebarOpen(false)

  return (
    <div className={cn()}>
      <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />
      <div className={cn('wrapper')}>
        <button
          type="button"
          className={cn('menuBtn')}
          onClick={handleOpenSidebar}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <div className={cn('body')}>
          <main className={cn('content')}>
            {slug && <MarkdownRenderer slug={slug} onContent={setTocContent} />}
          </main>
          <TableOfContents content={tocContent} />
        </div>
      </div>
    </div>
  )
}

export default DocsPage
