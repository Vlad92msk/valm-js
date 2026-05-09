import { useState, type ReactNode } from 'react'

import styles from '../PlaygroundPage.module.scss'
import { makeCn } from '../../../utils/makeCn'

const cn = makeCn('PlaygroundPage', styles)

interface HintRowProps {
  label: string
  hint?: string
  children: ReactNode
}

const HintRow = ({ label, hint, children }: HintRowProps) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className={cn('controlRow')}>
        <span className={cn('controlLabel')}>
          {label}
          {hint && (
            <button
              type="button"
              className={cn('hintBtn', { open })}
              onClick={() => setOpen((v) => !v)}
              aria-label="Подсказка"
            >
              ?
            </button>
          )}
        </span>
        {children}
      </div>
      {hint && (
        <div className={cn('hintBody', { open })}>
          <div className={cn('hintInner')}>
            <p className={cn('hintText')}>{hint}</p>
          </div>
        </div>
      )}
    </>
  )
}

export default HintRow
