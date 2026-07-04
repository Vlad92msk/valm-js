import { ViteReactSSG } from 'vite-react-ssg'

import './styles/fonts.css'
import './styles/global.css'
import './i18n'
import { routes } from './App'

// Точка входа для vite-react-ssg: на сервере пререндерит роуты в статический HTML,
// на клиенте гидрирует. dev по-прежнему на обычном vite.
export const createRoot = ViteReactSSG({ routes })
