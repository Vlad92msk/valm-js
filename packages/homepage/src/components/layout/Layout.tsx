import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

import styles from './Layout.module.scss'
import { makeCn } from '../../utils/makeCn'
import Header from '../header/Header'
import { applyStoredLocale } from '../../i18n'

const cn = makeCn('Layout', styles)

const Layout = () => {
  // После гидрации (сервер и первый клиентский рендер — на PRERENDER_LOCALE)
  // применяем реальный язык пользователя из localStorage / DEFAULT_LOCALE.
  useEffect(() => {
    applyStoredLocale()
  }, [])

  return (
    <div className={cn()}>
      <Header />
      <main className={cn('content')}>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
