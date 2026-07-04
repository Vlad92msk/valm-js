import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/custom-effects.md + guides/effects.md (доступ к контроллеру).
// Кастомный эффект без requiredFeatures не тянет MediaPipe — надёжный тест конвейера.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('effectsController без плагина кидает понятную ошибку', async ({ page }) => {
  const result = await page.evaluate(() => {
    try {
      // доступ к геттеру должен бросить
      void window.__valm.effectsController
      return { threw: false, message: '' }
    } catch (e: any) {
      return { threw: true, message: String(e.message) }
    }
  })
  expect(result.threw).toBe(true)
  expect(result.message).toContain('EffectsPlugin')
})

test('use(EffectsPlugin) открывает доступ к effectsController', async ({ page }) => {
  const ok = await page.evaluate(() => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    const c = window.__valm.effectsController
    return { hasController: !!c, hasEnableBlur: typeof c.enableBlur === 'function', hasPlugin: window.__valm.hasPlugin('effects') }
  })
  expect(ok.hasController).toBe(true)
  expect(ok.hasEnableBlur).toBe(true)
  expect(ok.hasPlugin).toBe(true)
})

test('кастомный BaseEffect через addEffect реально меняет пиксели кадра', async ({ page }) => {
  const pixel = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()

    // Эффект без ML: заливает весь кадр красным
    const { BaseEffect, EffectType } = window.Effects
    class SolidRedEffect extends (BaseEffect as any) {
      name = 'solid-red'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        ctx.outputCtx.fillStyle = 'rgb(255,0,0)'
        ctx.outputCtx.fillRect(0, 0, ctx.width, ctx.height)
      }
    }

    const effect = new SolidRedEffect()
    await window.__valm.effectsController.addEffect(effect)

    // Читаем обработанный выходной трек камеры
    const track = window.__valm.cameraController.getTrack()!
    const video = document.getElementById('video') as HTMLVideoElement
    video.srcObject = new MediaStream([track])
    await video.play().catch(() => {})

    // Дать конвейеру отрисовать несколько кадров
    await new Promise((r) => setTimeout(r, 800))

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const c2d = canvas.getContext('2d')!
    c2d.drawImage(video, 0, 0, canvas.width, canvas.height)
    const [r, g, b] = Array.from(c2d.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data)

    const effects = window.__valm.effectsController.getEffects().map((e: any) => e.name)
    return { r, g, b, effects, vw: video.videoWidth }
  })

  expect(pixel.effects).toContain('solid-red')
  expect(pixel.vw).toBeGreaterThan(0) // обработанный трек реально отдаёт кадры
  // центр кадра должен стать красным
  expect(pixel.r).toBeGreaterThan(200)
  expect(pixel.g).toBeLessThan(80)
  expect(pixel.b).toBeLessThan(80)
})

test('removeEffect() убирает эффект из pipeline', async ({ page }) => {
  const after = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
    const { BaseEffect, EffectType } = window.Effects
    class NoopEffect extends (BaseEffect as any) {
      name = 'noop'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }
    await window.__valm.effectsController.addEffect(new NoopEffect())
    const before = window.__valm.effectsController.getEffects().map((e: any) => e.name)
    window.__valm.effectsController.removeEffect('noop')
    const afterNames = window.__valm.effectsController.getEffects().map((e: any) => e.name)
    return { before, afterNames }
  })
  expect(after.before).toContain('noop')
  expect(after.afterNames).not.toContain('noop')
})
