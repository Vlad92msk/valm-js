import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Адаптивная производительность pipeline: при устойчиво низком FPS пресет качества
// автоматически понижается по цепочке ultra→high→medium→low→mobile. Тяжёлый эффект
// (busy-wait в apply) детерминированно роняет FPS ниже порога. Долгий тест.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => window.__valm.use(new window.Effects.EffectsPlugin()))
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('устойчиво низкий FPS понижает пресет качества (ultra → ниже), pipeline остаётся жив', async ({ page }) => {
  await page.evaluate(async () => {
    const { BaseEffect, EffectType } = window.Effects as any
    // ~30 мс работы на кадр → при ultra (target 60, порог 42fps) реальный FPS ~32 < порога
    class Heavy extends BaseEffect {
      name = 'heavy'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        const end = performance.now() + 30
        while (performance.now() < end) {
          /* busy-wait — имитируем дорогой эффект */
        }
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }
    await window.__valm.cameraController.enable()
    const c = window.__valm.effectsController
    c.setQualityPreset('ultra')
    await c.addEffect(new Heavy())
  })

  // adaptive-проверка идёт каждые 5с и требует 2 подряд низких → понижение ~на 10-й секунде
  await expect
    .poll(async () => page.evaluate(() => window.__valm.effectsController.getPerformanceConfig().preset), { timeout: 25_000 })
    .not.toBe('ultra')

  const final = await page.evaluate(() => ({
    preset: window.__valm.effectsController.getPerformanceConfig().preset,
    fps: window.__valm.effectsController.state.currentFps,
    running: window.__valm.effectsController.state.isProcessingEnabled,
  }))

  // пресет понижен по цепочке (первый шаг — high)
  expect(['high', 'medium', 'low', 'mobile']).toContain(final.preset)
  // pipeline не умер: продолжает рендерить с ненулевым FPS
  expect(final.running).toBe(true)
  expect(final.fps).toBeGreaterThan(10)
})

test('при достаточном FPS adaptive-логика НЕ понижает пресет', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { BaseEffect, EffectType } = window.Effects as any
    class Light extends BaseEffect {
      name = 'light'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }
    await window.__valm.cameraController.enable()
    const c = window.__valm.effectsController
    c.setQualityPreset('medium') // target 30, порог 21 — дешёвый эффект держит выше
    await c.addEffect(new Light())
    // ждём дольше двух adaptive-интервалов (>12с)
    await new Promise((r) => setTimeout(r, 13_000))
    return { preset: c.getPerformanceConfig().preset, fps: c.state.currentFps }
  })
  // пресет не понижался — FPS был достаточным
  expect(result.preset).toBe('medium')
  expect(result.fps).toBeGreaterThan(21)
})
