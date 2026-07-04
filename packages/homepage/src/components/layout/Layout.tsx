import type { ReactNode } from 'react'

import styles from './Layout.module.scss'
import { makeCn } from '../../utils/makeCn'
import Header from '../header/Header'

const cn = makeCn('Layout', styles)

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className={cn()}>
      <Header />
      <main className={cn('content')}>{children}</main>
    </div>
  )
}

export default Layout
