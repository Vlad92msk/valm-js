# Правила: React компоненты

## Структура файла

Порядок в `.tsx` файле:
1. Импорты (библиотеки → стили → типы → внутренние модули)
2. `cn` — инициализация makeCn (сразу после импортов)
3. Интерфейс пропсов (если нужен)
4. Компонент
5. `export default ComponentName`

```tsx
// ✅
import { useState } from 'react'

import styles from './TopicCard.module.scss'
import type { TopicMeta } from '@/types/topic'
import { makeCn } from '@/utils/makeCn'

const cn = makeCn('TopicCard', styles)

interface TopicCardProps {
  topic: TopicMeta
  onTagClick: (tag: string) => void
}

const TopicCard = ({ topic, onTagClick }: TopicCardProps) => {
  return (
    <div className={cn()}>
      <h2 className={cn('title')}>{topic.title}</h2>
      <span className={cn('badge', { active: true })}>{topic.category}</span>
    </div>
  )
}

export default TopicCard
```

## Типизация пропсов

- **Никогда `FC<Props>`** — просто функция с типизированными аргументами
- Интерфейс пропсов называется `ComponentNameProps`
- Объявляется прямо перед компонентом в том же файле

```tsx
// ❌
const TopicCard: FC<{ title: string }> = ({ title }) => ...

// ✅
interface TopicCardProps {
  title: string
}
const TopicCard = ({ title }: TopicCardProps) => ...
```

## Порядок хуков в компоненте

1. `useRef` / `useState`
2. `useEffect`
3. Производные значения (`useMemo`, `useCallback`)
4. Обработчики событий (`const handleClick = ...`)

## Кастомные хуки

- Хранить в `src/hooks/`
- Один хук — одна задача
- Именование: `useKeyboardNav`, `useTopics`, `useStepFade`

## Стили

- Каждый компонент имеет свой `ComponentName.module.css`
- Никаких inline styles
- **Все классы — только через `makeCn`**, никогда напрямую `styles.className`
- `cn` инициализируется на уровне модуля (вне компонента), сразу после импортов

```tsx
// ❌ — напрямую через styles
<div className={styles.card}>
<div className={styles.cardActive}>

// ✅ — через cn
const cn = makeCn('TopicCard', styles)
<div className={cn()}>
<div className={cn({ active: isActive })}>
<div className={cn('title')}>
```

## Экспорт

- `export default` для компонентов-страниц и компонентов
- `export const` для утилит и хуков

## Markdown-директивы и MarkdownSection

Все кастомные markdown-директивы рендерятся через единый `section`-обработчик — `createSectionComponent` из `src/components/MarkdownSection.tsx`. Он проверяет `data-*` атрибуты и рендерит нужный компонент.

При добавлении новой директивы:
1. Создай remark-плагин в `src/utils/remarkXxx.ts` (ставит `hName: 'section'` + `data-*` атрибуты)
2. Создай React-компонент в `src/components/XxxBlock/`
3. Добавь ветку в `MarkdownSection.tsx`
4. Добавь плагин в `remarkPlugins` в `TopicPage.tsx` и `StepDrawer.tsx`

Не дублируй section-логику в страницах — всё через `MarkdownSection`.
