import { NavLink } from 'react-router-dom'

import logo from '../../assets/logo.svg'
import styles from './Header.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('Header', styles)

const Header = () => {
  return (
    <header className={cn()}>
      <div className={cn('inner')}>
        <NavLink to="/" className={cn('logo')}>
          <img src={logo} alt="valm" height={32} />
          valm
        </NavLink>
        <nav className={cn('nav')}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => cn('link', { active: isActive })}
          >
            Главная
          </NavLink>
          <NavLink
            to="/docs/getting-started"
            className={({ isActive }) => cn('link', { active: isActive })}
          >
            Документация
          </NavLink>
          <NavLink
            to="/playground"
            className={({ isActive }) => cn('link', { active: isActive })}
          >
            Playground
          </NavLink>
          <a
            href="https://github.com"
            className={cn('link')}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

export default Header
