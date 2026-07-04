import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './locales/ru'
import en from './locales/en'

export const LOCALES = ['ru', 'en'] as const
export type Locale = (typeof LOCALES)[number]

const STORAGE_KEY = 'valm-lang'

// Язык, который видит человек по умолчанию (без сохранённого выбора).
export const DEFAULT_LOCALE: Locale = 'ru'

// Язык, на котором идёт SSG-пререндер и первый клиентский рендер (для чистой
// гидрации). Сайт пререндерится EN-only: статический HTML, который читают агенты
// и Google, — английский. Реальный выбор пользователя применяется на клиенте
// после маунта (applyStoredLocale), уже поверх совпавшей с сервером разметки.
export const PRERENDER_LOCALE: Locale = 'en'

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: PRERENDER_LOCALE,
  fallbackLng: PRERENDER_LOCALE,
  interpolation: { escapeValue: false },
  returnObjects: true,
})

// Синхронизируем выбор языка с localStorage и атрибутом lang документа.
i18n.on('languageChanged', (lng) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lng)
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language

/**
 * Применяет реальный язык пользователя на клиенте (после гидрации): сохранённый
 * выбор из localStorage, иначе — DEFAULT_LOCALE. Вызывается один раз при маунте.
 * До этого и сервер, и клиент отрендерили PRERENDER_LOCALE — гидрация без рассинхрона.
 */
export const applyStoredLocale = (): void => {
  if (typeof localStorage === 'undefined') return
  const stored = localStorage.getItem(STORAGE_KEY)
  const target =
    stored && (LOCALES as readonly string[]).includes(stored)
      ? (stored as Locale)
      : DEFAULT_LOCALE
  if (target !== i18n.language) void i18n.changeLanguage(target)
}

export default i18n
