import { createHighlighter } from 'shiki'

// Создаётся один раз, переиспользуется
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['material-theme-ocean'],
      langs: ['typescript', 'javascript', 'tsx', 'jsx', 'bash', 'json', 'css', 'html', 'markdown'],
    })
  }
  return highlighterPromise
}
