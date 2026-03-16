# Правила: Стили

## Подход

- **CSS Modules** для стилей компонентов (`.module.scss`)
- **CSS custom properties** для всех визуальных токенов (определены в `src/styles/global.css`)
- Никаких inline styles (`style={{ ... }}`)
- Никаких сторонних animation библиотек — только CSS transitions

## Токены

Все токены определены в `src/styles/global.css` на `:root`. Всегда использовать переменные:

```scss
/* ✅ */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-4);
  color: var(--color-text);
}

/* ❌ Хардкодить значения запрещено */
.card {
  background: #1a1d27;
  padding: 16px;
}
```

### Справочник токенов

```css
/* Цвета */
--color-bg:       #0f1117   /* фон страницы */
--color-surface:  #1a1d27   /* карточки, блоки */
--color-border:   #2a2d3a   /* границы */
--color-text:     #e2e8f0   /* основной текст */
--color-muted:    #64748b   /* второстепенный текст */
--color-accent:   #3b82f6   /* ссылки, активные элементы */
--color-success:  #22c55e   /* ✓ карточки в :::problems */
--color-error:    #ef4444   /* ❌ карточки в :::problems */

/* Типографика */
--font-sans:  "Inter", sans-serif
--font-mono:  "JetBrains Mono", monospace

/* Отступы */
--space-1: 4px
--space-2: 8px
--space-4: 16px
--space-8: 32px

/* Прочее */
--radius: 8px
```

## CSS Modules — именование классов

Используется BEM-нотация через `makeCn` с разделителями `{ e: '-', m: '--', v: '_' }`.
Классы в `.module.scss` именуются по правилам BEM, доступ к ним — через `cn()`.

### Структура SCSS — вложенность через `&`

Все элементы, модификаторы, псевдоклассы и медиа-запросы пишутся вложенно внутри блока:

```scss
// ✅ — SCSS вложенность
.TopicCard {
  // стили блока

  &-title {
    // cn('title')
  }

  &-badge {
    // cn('badge')
    color: var(--color-muted);

    &--active {
      // cn('badge', { active: true })
      color: var(--color-accent);
    }

    &:hover {
      color: var(--color-text);
    }

    @media (max-width: 768px) {
      font-size: var(--text-sm);
    }
  }

  &--active {
    // cn({ active: true })
    border-color: var(--color-accent);
  }

  &--type {
    &_theory {
      // cn({ type: 'theory' })
      color: var(--color-accent);
    }

    &_task {
      // cn({ type: 'task' })
      color: var(--color-success);
    }
  }
}

// ❌ — плоские классы запрещены
.TopicCard { }
.TopicCard-title { }
.TopicCard-badge--active { }
```

### Правила `makeCn`

| Вызов `cn` | Имя класса в CSS |
|---|---|
| `cn()` | `.ComponentName` |
| `cn('elem')` | `.ComponentName-elem` |
| `cn({ mod: true })` | `.ComponentName--mod` |
| `cn({ type: 'primary' })` | `.ComponentName--type_primary` |
| `cn('elem', { mod: true })` | `.ComponentName-elem--mod` |

Инициализация — один раз на уровне модуля, сразу после импортов:

```tsx
import styles from './TopicCard.module.scss'
import { makeCn } from '@/utils/makeCn'

const cn = makeCn('TopicCard', styles)
```

## Стили для markdown-контента

`react-markdown` рендерит стандартные HTML теги. Стили пишутся в `src/styles/markdown.css`
через CSS-класс обёртки — не через inline, не через глобальные теги:

```css
/* src/styles/markdown.css */
.markdownContent h1 { font-size: 1.75rem; }
.markdownContent h2 { font-size: 1.375rem; margin-top: var(--space-8); }
.markdownContent p  { line-height: 1.7; }
.markdownContent code { font-family: var(--font-mono); }
.markdownContent pre { background: var(--color-surface); border-radius: var(--radius); }
```

## Анимации

Только CSS transitions — никакого JavaScript для анимаций:

```scss
// ✅ Fade при смене шага
.stepContent {
  transition: opacity 0.2s ease;

  &--fading {
    opacity: 0;
  }
}
```
