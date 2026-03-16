import { Link, NavLink } from 'react-router-dom'

import styles from './Sidebar.module.scss'
import { makeCn } from '../../utils/makeCn'
const cn = makeCn('Sidebar', styles)

interface NavItem {
  slug: string
  title: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'НАЧАЛО РАБОТЫ',
    items: [{ slug: 'getting-started', title: 'Getting Started' }],
  },
  {
    label: 'CORE',
    items: [
      { slug: 'camera', title: 'Camera' },
      { slug: 'microphone', title: 'Microphone' },
      { slug: 'screen-share', title: 'Screen Share' },
      { slug: 'devices', title: 'Devices' },
      { slug: 'permissions', title: 'Permissions' },
      { slug: 'configuration', title: 'Configuration' },
    ],
  },
  {
    label: 'EFFECTS',
    items: [
      { slug: 'effects', title: 'Effects' },
      { slug: 'custom-effects', title: 'Custom Effects' },
    ],
  },
  {
    label: 'ADVANCED',
    items: [
      { slug: 'events', title: 'Events' },
      { slug: 'plugins', title: 'Plugins' },
      { slug: 'recording', title: 'Recording' },
      { slug: 'transcription', title: 'Transcription' },
      { slug: 'utilities', title: 'Utilities' },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: VoidFunction
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  return (
    <>
      {isOpen && <div className={cn('overlay')} onClick={onClose} />}
      <aside className={cn({ open: isOpen })}>
        <div className={cn('home')}>

          <Link to="/" className={cn('homeLink')}>
            Home</Link>
        </div>
        <nav className={cn('nav')}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={cn('group')}>
              <span className={cn('groupLabel')}>{group.label}</span>
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
