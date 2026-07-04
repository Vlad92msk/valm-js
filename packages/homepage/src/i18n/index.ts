import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './locales/ru'
import en from './locales/en'

export const LOCALES = ['ru', 'en'] as const
export type Locale = (typeof LOCALES)[number]

const STORAGE_KEY = 'valm-lang'
export const DEFAULT_LOCALE: Locale = 'ru'

const detectInitialLocale = (): Locale => {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  return stored && (LOCALES as readonly string[]).includes(stored)
    ? (stored as Locale)
    : DEFAULT_LOCALE
}

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: detectInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnObjects: true,
})

// Синхронизируем выбор языка с localStorage и атрибутом lang документа.
i18n.on('languageChanged', (lng) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lng)
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language

export default i18n
