import type { Page } from '@playwright/test'

// Типы окна фикстуры (см. e2e/fixture/main.ts). Держим их слабыми — в браузере
// живёт настоящий Valm, а сюда прилетают только сериализуемые снимки.
type ValmModule = typeof import('../../src')
type EffectsModule = typeof import('../../src/effects')
type AudioEffectsModule = typeof import('../../src/audio-effects')

declare global {
  interface Window {
    Valm: ValmModule
    Effects: EffectsModule
    AudioEffects: AudioEffectsModule
    valmReady: boolean
    // Единственный активный инстанс, которым оперируют спеки.
    __valm: any
    // Буфер для событий, собираемых внутри страницы.
    __events: any[]
  }
}

/** Открыть фикстуру и дождаться, пока бандл выложит Valm в window. */
export async function gotoFixture(page: Page): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await page.waitForFunction(() => window.valmReady === true, undefined, { timeout: 15_000 })
  if (errors.length) throw new Error(`Ошибки загрузки фикстуры:\n${errors.join('\n')}`)
}

/**
 * Создать инстанс Valm в контексте страницы и положить его в window.__valm.
 * Возвращает управление после конструктора (без initialize).
 */
export async function newValm(page: Page, config: Record<string, any> = {}): Promise<void> {
  await page.evaluate((cfg) => {
    window.__valm = new window.Valm.Valm(cfg)
    window.__events = []
  }, config)
}

/** Создать Valm и инициализировать медиа (поднять треки согласно конфигу). */
export async function newInitializedValm(page: Page, config: Record<string, any> = {}): Promise<void> {
  await newValm(page, config)
  await page.evaluate(() => window.__valm.initialize())
}

/** Уничтожить текущий инстанс (вызывать в afterEach для чистоты между тестами). */
export async function destroyValm(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (window.__valm) {
      try {
        await window.__valm.destroy()
      } catch {
        /* игнорируем — тест мог оставить инстанс в частично уничтоженном виде */
      }
      window.__valm = undefined
    }
  })
}

/** Прочитать агрегированное состояние Valm.getState() (сериализуемое). */
export function getState(page: Page): Promise<any> {
  return page.evaluate(() => window.__valm.getState())
}

/**
 * Дождаться, пока предикат над состоянием станет истинным.
 * Предикат сериализуется в строку и исполняется в браузере над window.__valm.getState().
 */
export async function waitForState(page: Page, predicate: (state: any) => boolean, timeout = 10_000): Promise<void> {
  const predicateStr = predicate.toString()
  await page.waitForFunction(
    (fnStr) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${fnStr})`)()
      return fn(window.__valm.getState())
    },
    predicateStr,
    { timeout },
  )
}
