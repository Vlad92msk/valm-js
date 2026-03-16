import { Routes, Route, Navigate } from 'react-router-dom'

import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage/HomePage'
import DocsPage from './pages/DocsPage/DocsPage'
import PlaygroundPage from './pages/PlaygroundPage/PlaygroundPage'

const App = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/docs" element={<Navigate to="/docs/getting-started" replace />} />
        <Route path="/docs/:slug" element={<DocsPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
      </Routes>
    </Layout>
  )
}

export default App
