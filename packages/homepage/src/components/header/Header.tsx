import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import styles from './Header.module.scss'
import { makeCn } from '../../utils/makeCn'
import LanguageSwitcher from '../language-switcher/LanguageSwitcher'
import favicon from "../../assets/favicon.svg";

const cn = makeCn('Header', styles)

const GITHUB_URL = 'https://github.com/Vlad92msk/valm-js'

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={cn('icon')} aria-hidden="true">
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
)

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('icon')} aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

const Header = () => {
  const { t } = useTranslation()

  return (
    <header className={cn()}>
      <div className={cn('inner')}>
        <NavLink to="/" className={cn('brand')}>
          <img src={favicon} alt="" width={26} height={26} />
          <span className={cn('brandVersion')}>v{__VALM_VERSION__}</span>
        </NavLink>

        <LanguageSwitcher />

        <nav className={cn('nav')}>
          <NavLink to="/" end className={({ isActive }) => cn('link', { active: isActive })}>
            {t('nav.home')}
          </NavLink>
          <NavLink
            to="/docs/getting-started"
            className={({ isActive }) => cn('link', { active: isActive })}
          >
            {t('nav.docs')}
          </NavLink>
          <NavLink to="/playground" className={({ isActive }) => cn('link', { active: isActive })}>
            {t('nav.playground')}
          </NavLink>
        </nav>

        <div className={cn('actions')}>
          <a
            href={GITHUB_URL}
            className={cn('ghost')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubIcon />
            {t('header.github')}
          </a>
          <NavLink to="/playground" className={cn('cta')}>
            {t('header.playgroundCta')}
            <ArrowRightIcon />
          </NavLink>
        </div>
      </div>
    </header>
  )
}

export default Header
