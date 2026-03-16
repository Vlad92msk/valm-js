# Правила: Именование

## Файлы и папки

| Тип | Конвенция | Пример |
|-----|-----------|--------|
| React компонент | PascalCase | `TopicCard.tsx`, `StepNav.tsx` |
| CSS модуль | PascalCase + .module.css | `TopicCard.module.css` |
| Страница | PascalCase + Page | `HomePage.tsx`, `TopicPage.tsx` |
| Хук | camelCase с `use` | `useKeyboardNav.ts`, `useTopics.ts` |
| Утилита | camelCase | `sortTopics.ts`, `parseProblems.ts` |
| Сервис | camelCase | `localContentService.ts` |
| Типы/интерфейсы | camelCase | `topic.ts`, `step.ts` |
| Папки компонентов | kebab-case | `topic-card/`, `step-nav/` |
| Content папки | kebab-case | `promises-cache-retry/`, `event-loop/` |

## Переменные и функции

- **Boolean**: `is`, `has`, `should` префикс → `isLoading`, `hasSteps`, `shouldFade`
- **Обработчики событий**: `handle` префикс → `handleStepClick`, `handleKeyDown`
- **Компоненты**: PascalCase → `const TopicCard = ...`
- **Функции/утилиты**: camelCase стрелочные → `const sortTopics = () => {}`
- **Константы**: UPPER_SNAKE_CASE → `const MAX_STEPS = 99`

## CSS классы в .module.css

Только camelCase:

```css
/* ✅ */
.topicCard { }
.stepButton { }
.isActive { }

/* ❌ */
.topic-card { }
.step_button { }
```

## Пример

```typescript
// ✅ файл: TopicCard.tsx
interface TopicCardProps {
  topic: TopicMeta
  isActive: boolean
  onTagClick: (tag: string) => void
}

const TopicCard = ({ topic, isActive, onTagClick }: TopicCardProps) => { ... }

// ✅ файл: useKeyboardNav.ts
const useKeyboardNav = (totalSteps: number) => { ... }

// ✅ утилита: sortTopics.ts
export const sortTopics = (topics: TopicMeta[]): TopicMeta[] => { ... }
```
