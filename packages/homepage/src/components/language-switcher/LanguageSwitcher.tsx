import { useTranslation } from 'react-i18next'

import { LOCALES, type Locale } from '../../i18n'
import styles from './LanguageSwitcher.module.scss'
import { makeCn } from '../../utils/makeCn'

const cn = makeCn('LanguageSwitcher', styles)

const LanguageSwitcher = () => {
  const { i18n } = useTranslation()
  const current = i18n.language as Locale

  const handleSelect = (locale: Locale) => {
    if (locale !== current) i18n.changeLanguage(locale)
  }

  return (
    <div className={cn()} role="group" aria-label="Language">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={cn('option', { active: locale === current })}
          onClick={() => handleSelect(locale)}
          aria-pressed={locale === current}
        >
          {locale}
        </button>
      ))}
    </div>
  )
}

export default LanguageSwitcher
