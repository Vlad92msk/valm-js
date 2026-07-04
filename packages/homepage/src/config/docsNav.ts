// Единый источник структуры документации: используется и боковым меню (Sidebar),
// и страницей документа (для overline с названием группы). Заголовки пунктов —
// имена API/контроллеров, одинаковы для всех языков; переводится только ярлык группы
// (groupKey → i18n-ключ sidebar.groups.*).

export interface DocsNavItem {
  slug: string
  title: string
}

export interface DocsNavGroup {
  /** Ключ для i18n: sidebar.groups.<key> */
  key: 'start' | 'core' | 'effects' | 'advanced'
  items: DocsNavItem[]
}

export const DOCS_NAV: DocsNavGroup[] = [
  {
    key: 'start',
    items: [{ slug: 'getting-started', title: 'Getting Started' }],
  },
  {
    key: 'core',
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
    key: 'effects',
    items: [
      { slug: 'effects', title: 'Effects' },
      { slug: 'audio-effects', title: 'Audio Effects' },
      { slug: 'custom-effects', title: 'Custom Effects' },
    ],
  },
  {
    key: 'advanced',
    items: [
      { slug: 'events', title: 'Events' },
      { slug: 'plugins', title: 'Plugins' },
      { slug: 'recording', title: 'Recording' },
      { slug: 'transcription', title: 'Transcription' },
      { slug: 'diagnostics', title: 'Diagnostics' },
      { slug: 'utilities', title: 'Utilities' },
    ],
  },
]

/** i18n-ключ ярлыка группы, к которой относится документ, либо null. */
export const getGroupKey = (slug: string): DocsNavGroup['key'] | null =>
  DOCS_NAV.find((g) => g.items.some((it) => it.slug === slug))?.key ?? null

/** Заголовок документа из структуры навигации (fallback — сам slug). */
export const getDocTitle = (slug: string): string => {
  for (const group of DOCS_NAV) {
    const item = group.items.find((it) => it.slug === slug)
    if (item) return item.title
  }
  return slug
}
