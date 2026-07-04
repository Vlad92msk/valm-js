import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// EffectsEvents, не покрытые effects.spec.ts. Лёгкий сьют: кастомные эффекты без ML
// (не тянут MediaPipe), поэтому надёжен. Проверяем симметрию PROCESSING_STARTED/STOPPED
// (PROCESSING_STARTED раньше НЕ эмитился — баг, исправлен), QUALITY/PERFORMANCE_CHANGED,
// EFFECT_ADDED/REMOVED.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    // фабрика кастомного эффекта без ML (COLOR_FILTER, requiredFeatures пуст)
    const { BaseEffect, EffectType } = window.Effects as any
    ;(window as any).__mkEffect = (name: string) =>
      new (class extends BaseEffect {
        name = name
        type = EffectType.COLOR_FILTER
        requiredFeatures: any[] = []
        constructor() {
          super({})
        }
        apply(ctx: any) {
          ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
        }
      })()
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('PROCESSING_STARTED летит при первом активном эффекте, PROCESSING_STOPPED — при снятии последнего', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    const log: string[] = []
    c.on(EffectsEvents.PROCESSING_STARTED, () => log.push('started'))
    c.on(EffectsEvents.PROCESSING_STOPPED, () => log.push('stopped'))

    await c.addEffect((window as any).__mkEffect('e1'))
    const afterAdd = [...log]
    c.removeEffect('e1')
    const afterRemove = [...log]
    return { afterAdd, afterRemove }
  })

  expect(result.afterAdd).toEqual(['started']) // ровно один started (раньше событие было мёртвым)
  expect(result.afterRemove).toEqual(['started', 'stopped']) // симметричный stopped
})

test('PROCESSING_STARTED/STOPPED летят по одному разу на пачку эффектов', async ({ page }) => {
  const log = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    const log: string[] = []
    c.on(EffectsEvents.PROCESSING_STARTED, () => log.push('started'))
    c.on(EffectsEvents.PROCESSING_STOPPED, () => log.push('stopped'))

    await c.addEffect((window as any).__mkEffect('a'))
    await c.addEffect((window as any).__mkEffect('b')) // второй не должен снова стартовать
    c.removeEffect('a') // ещё остаётся b — не стоп
    c.removeEffect('b') // последний — стоп
    return log
  })

  // ровно один started и один stopped, несмотря на два эффекта
  expect(log).toEqual(['started', 'stopped'])
})

test('stopProcessing() эмитит PROCESSING_STOPPED (через переход activeEffects→0)', async ({ page }) => {
  const log = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    const log: string[] = []
    c.on(EffectsEvents.PROCESSING_STARTED, () => log.push('started'))
    c.on(EffectsEvents.PROCESSING_STOPPED, () => log.push('stopped'))

    await c.addEffect((window as any).__mkEffect('x'))
    await c.addEffect((window as any).__mkEffect('y'))
    c.stopProcessing()
    return log
  })
  // один старт на добавление, ровно один стоп (без дубля от прежнего явного emit)
  expect(log).toEqual(['started', 'stopped'])
})

test('EFFECT_ADDED и EFFECT_REMOVED летят с именем эффекта', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    const added: string[] = []
    const removed: string[] = []
    c.on(EffectsEvents.EFFECT_ADDED, (e: any) => added.push(e.effect))
    c.on(EffectsEvents.EFFECT_REMOVED, (e: any) => removed.push(e.effect))

    await c.addEffect((window as any).__mkEffect('my-effect'))
    c.removeEffect('my-effect')
    return { added, removed }
  })
  expect(result.added).toContain('my-effect')
  expect(result.removed).toContain('my-effect')
})

test('QUALITY_CHANGED летит с пресетом на setQualityPreset', async ({ page }) => {
  const presets = await page.evaluate(() => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    const got: string[] = []
    c.on(EffectsEvents.QUALITY_CHANGED, (d: any) => got.push(d.preset))
    c.setQualityPreset('high')
    c.setQualityPreset('low')
    return got
  })
  expect(presets).toEqual(['high', 'low'])
})

test('PERFORMANCE_CHANGED летит с конфигом на setPerformanceConfig', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = window.__valm.effectsController
    const { EffectsEvents } = window.Effects as any
    let cfg: any = null
    c.on(EffectsEvents.PERFORMANCE_CHANGED, (config: any) => (cfg = config))
    c.setPerformanceConfig({ preset: 'custom', targetFps: 20 })
    return cfg
  })
  expect(result).not.toBeNull()
  expect(result.preset).toBe('custom')
  expect(result.targetFps).toBe(20)
})
