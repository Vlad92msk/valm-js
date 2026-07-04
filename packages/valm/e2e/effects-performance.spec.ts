import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'
import { inspectTrack } from './helpers/media'

// Пресеты качества / performance-конфиг и разница disableAllEffects vs stopProcessing.
// Лёгкий сьют: pipeline существует сразу после use(EffectsPlugin) (создаётся в install),
// поэтому setQualityPreset/getPerformanceConfig работают без камеры.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => {
    window.__valm.use(new window.Effects.EffectsPlugin())
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

test('setQualityPreset() отражается в getPerformanceConfig().preset', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = window.__valm.effectsController
    const initial = c.getPerformanceConfig().preset
    c.setQualityPreset('high')
    const high = c.getPerformanceConfig().preset
    c.setQualityPreset('mobile')
    const mobile = c.getPerformanceConfig().preset
    return { initial, high, mobile }
  })
  expect(result.initial).toBe('medium') // дефолт
  expect(result.high).toBe('high')
  expect(result.mobile).toBe('mobile')
})

test('setTargetFps()/setBlurQuality() переводят preset в custom и пишут значение', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = window.__valm.effectsController
    c.setTargetFps(45)
    const afterFps = c.getPerformanceConfig()
    c.setBlurQuality(12)
    const afterBlur = c.getPerformanceConfig()
    return { afterFps, afterBlur }
  })
  expect(result.afterFps.preset).toBe('custom')
  expect(result.afterFps.targetFps).toBe(45)
  // setBlurQuality мёржит поверх custom — targetFps сохраняется
  expect(result.afterBlur.preset).toBe('custom')
  expect(result.afterBlur.blurQuality).toBe(12)
  expect(result.afterBlur.targetFps).toBe(45)
})

test('setPerformanceConfig() мёржит и шлёт значения в getPerformanceConfig', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = window.__valm.effectsController
    c.setPerformanceConfig({ preset: 'custom', targetFps: 24, mlFrameSkip: 3 })
    const a = c.getPerformanceConfig()
    c.setPerformanceConfig({ blurQuality: 9 })
    const b = c.getPerformanceConfig()
    return { a, b }
  })
  expect(result.a.targetFps).toBe(24)
  expect(result.a.mlFrameSkip).toBe(3)
  // второй вызов мёржит, не затирая прежние поля
  expect(result.b.blurQuality).toBe(9)
  expect(result.b.targetFps).toBe(24)
  expect(result.b.mlFrameSkip).toBe(3)
})

test('disableAllEffects() гасит эффекты, но не удаляет их; камера-трек жив', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    await window.__valm.cameraController.enable()
    await c.addEffect((window as any).__mkEffect('keep-me'))

    c.disableAllEffects()

    const effects = c.getEffects().map((e: any) => ({ name: e.name, enabled: e.isEnabled() }))
    return {
      effects,
      activeEffects: c.state.activeEffects,
    }
  })

  // эффект остался зарегистрированным, но выключен
  expect(result.effects.map((e: any) => e.name)).toContain('keep-me')
  expect(result.effects.find((e: any) => e.name === 'keep-me').enabled).toBe(false)
  expect(result.activeEffects).not.toContain('keep-me')

  // выходной трек камеры продолжает жить (pipeline вернулся к raw-треку)
  const track = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(track.readyState).toBe('live')
})

test('stopProcessing() удаляет все эффекты из pipeline; камера-трек жив', async ({ page }) => {
  const effects = await page.evaluate(async () => {
    const c = window.__valm.effectsController
    await window.__valm.cameraController.enable()
    await c.addEffect((window as any).__mkEffect('a'))
    await c.addEffect((window as any).__mkEffect('b'))
    c.stopProcessing()
    return c.getEffects().map((e: any) => e.name)
  })
  expect(effects).toEqual([]) // все эффекты удалены (в отличие от disableAllEffects)

  const track = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(track.readyState).toBe('live')
})
