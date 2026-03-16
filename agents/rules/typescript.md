# Правила: TypeScript

## Типы и интерфейсы

- Никаких `any` — использовать `unknown` с проверкой или конкретный тип
- `interface` для объектов, `type` для union/intersection
- Для union строковых значений — `type` с литералами или `as const` объект

```typescript
// ❌
const difficulty = 'easy' as any

// ✅
type Difficulty = 'easy' | 'medium' | 'hard'
```

## Типы проекта DevNotes

Основные типы определены в `src/types/`. При создании компонентов и сервисов — использовать эти типы, не дублировать:

```typescript
// src/types/topic.ts
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface TopicMeta {
  slug: string       // 'promises-cache-retry'
  title: string      // 'Promise: кэш + retry'
  category: string   // 'JS Core'
  tags: string[]     // ['async', 'cache', 'retry']
  difficulty: Difficulty
  order?: number
}

export interface Topic extends TopicMeta {
  content: string    // содержимое content.md
}

export interface Step {
  filename: string   // '01-basic-cache.md'
  order: number      // 1
  title: string      // H1 из файла
  subtitle?: string  // blockquote из файла (если есть)
  content: string    // полное содержимое .md
}
```

## ContentService

Все обращения к контенту — только через этот интерфейс:

```typescript
// src/services/contentService.ts
export interface ContentService {
  getTopics(): Promise<TopicMeta[]>
  getTopic(slug: string): Promise<Topic>
  getSteps(slug: string): Promise<Step[]>
}
```

Фаза 1 реализует `LocalContentService`, фаза 2 — `FirebaseContentService`.
Компоненты импортируют только интерфейс, не конкретную реализацию.

## Generics

- Использовать когда одна функция/хук работает с разными типами данных
- Называть: `T`, `TItem`, `TData` — не `x`, не `any`

## Импорты типов

Всегда использовать `import type` для импорта только типов:

```typescript
// ✅
import type { TopicMeta, Step } from '@/types/topic'

// ❌ (импортирует в runtime)
import { TopicMeta } from '@/types/topic'
```
