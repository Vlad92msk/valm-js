import { useState, type ReactNode } from 'react'
import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'

const cn = makeCn('PlaygroundPage', styles)

export interface TabItem {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  activeTab?: string
  onTabChange?: (id: string) => void
}

export const Tabs = ({ tabs, activeTab: controlledTab, onTabChange }: TabsProps) => {
  const [internalTab, setInternalTab] = useState(tabs[0]?.id ?? '')
  const isControlled = controlledTab !== undefined
  const activeTab = isControlled ? controlledTab : internalTab

  const handleClick = (id: string) => {
    if (isControlled) {
      onTabChange?.(id)
    } else {
      setInternalTab(id)
    }
  }

  if (tabs.length === 0) return null

  return (
    <>
      {tabs.length > 1 && (
        <div className={cn('tabBar')}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn('tab', { active: activeTab === tab.id })}
              onClick={() => handleClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className={cn('tabPanel')} key={activeTab}>
        {tabs.find((t) => t.id === activeTab)?.content}
      </div>
    </>
  )
}
