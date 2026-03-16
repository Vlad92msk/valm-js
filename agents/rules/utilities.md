# Правила: Утилиты и функции

## Общие правила

- Стрелочные функции везде: `export const fn = () => {}`
- `function` declaration не используем
- Именованные импорты: `import { foo } from 'bar'`

## Работа с массивами и объектами

Нативный JS — никаких внешних utility библиотек (lodash и т.п.):

```typescript
// ✅ Сортировка тем
export const sortTopics = (topics: TopicMeta[]): TopicMeta[] =>
  [...topics].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order
    return a.title.localeCompare(b.title)
  })

// ✅ Группировка по категории
export const groupByCategory = (topics: TopicMeta[]): Record<string, TopicMeta[]> =>
  topics.reduce<Record<string, TopicMeta[]>>((acc, topic) => {
    const key = topic.category
    acc[key] = acc[key] ? [...acc[key], topic] : [topic]
    return acc
  }, {})
```

## Парсинг markdown-контента

Утилиты для работы с `.md` файлами:

```typescript
// Извлечь H1 и blockquote из шага
export const parseStepMeta = (content: string): { title: string; subtitle?: string } => {
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const subtitleMatch = content.match(/^>\s+(.+)$/m)
  return {
    title: titleMatch?.[1] ?? 'Без названия',
    subtitle: subtitleMatch?.[1],
  }
}
```

## ContentService — паттерн создания

```typescript
// Фаза 1: читать через Vite glob
const modules = import.meta.glob('/content/**/meta.json', { eager: true })

// Не обращаться к файлам напрямую из компонентов
// Всегда через ContentService.getTopics() / getTopic() / getSteps()
```

## Что НЕ трогать

- Файлы в `/content/` — это данные, не код
- `src/styles/global.css` — только расширять, не менять существующие токены
