import { lazy, Suspense } from 'react'
import type { RouteRecord } from 'vite-react-ssg'

import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage/HomePage'
import DocsPage from './pages/DocsPage/DocsPage'

// Playground тянет valm-js / valm-js/effects (MediaStream + ML-провайдеры) прямо
// в импортах — грузим лениво, чтобы этот код НЕ попадал в SSR-граф пререндера.
// Страница вне пререндера (SPA-only), поэтому на сервере динамический импорт не бежит.
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage/PlaygroundPage'))

// Роуты в формате data-router (массив), как требует vite-react-ssg. Корневой
// layout-роут (Header + <Outlet/>) общий для всех страниц. `/docs` рендерит тот же
// DocsPage с дефолтным разделом — так пререндеренный /docs несёт реальный контент
// и полный сайдбар со ссылками (агент обходит по ним всю документацию).
export const routes: RouteRecord[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'docs/:slug', element: <DocsPage /> },
      {
        path: 'playground',
        element: (
          <Suspense fallback={null}>
            <PlaygroundPage />
          </Suspense>
        ),
      },
    ],
  },
]
