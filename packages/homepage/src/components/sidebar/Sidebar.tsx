import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import styles from './Sidebar.module.scss'
import { makeCn } from '../../utils/makeCn'
import { DOCS_NAV } from '../../config/docsNav'

const cn = makeCn('Sidebar', styles)

interface SidebarProps {
  isOpen: boolean
  onClose: VoidFunction
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { t } = useTranslation()

  return (
    <>
      {isOpen && <div className={cn('overlay')} onClick={onClose} />}
      <aside className={cn({ open: isOpen })}>
        <nav className={cn('nav')}>
          {DOCS_NAV.map((group) => (
            <div key={group.key} className={cn('group')}>
              <div className={cn('groupLabel')}>{t(`sidebar.groups.${group.key}`)}</div>
              <ul className={cn('list')}>
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <NavLink
                      to={`/docs/${item.slug}`}
                      className={({ isActive }) => cn('link', { active: isActive })}
                      onClick={onClose}
                    >
                      {item.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
