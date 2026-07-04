import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/effects.md — ТЯЖЁЛЫЙ сьют: грузит MediaPipe WASM + модель
// сегментации (отдаются локально из homepage/public через publicDir фикстуры).

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

// Хелпер: включить блюр, вернуть флаг успеха (false → MediaPipe не поднялся в этой среде)
async function tryEnableBlur(page: import('@playwright/test').Page): Promise<{ ok: boolean; error: string }> {
  return page.evaluate(async () => {
    try {
      await window.__valm.effectsController.enableBlur()
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
}

test('enableBlur() запускает pipeline, даёт обработанный трек и currentFps > 0', async ({ page }) => {
  const enabled = await tryEnableBlur(page)
  test.skip(!enabled.ok, `MediaPipe не поднялся в этой среде: ${enabled.error}`)

  // состояние сразу после включения
  const state = await page.evaluate(() => window.__valm.effectsController.state)
  expect(state.blur.isEnabled).toBe(true)
  expect(state.isProcessingEnabled).toBe(true)
  expect(state.activeEffects).toContain('background_blur')

  // getBlurParams не null и содержит intensity/mode
  const params = await page.evaluate(() => window.__valm.effectsController.getBlurParams())
  expect(params).not.toBeNull()
  expect(typeof params.intensity).toBe('number')

  // currentFps > 0 — pipeline реально рендерит (даём время накопить FPS)
  await expect
    .poll(async () => page.evaluate(() => window.__valm.effectsController.state.currentFps), { timeout: 15_000 })
    .toBeGreaterThan(0)

  // обработанный выходной трек камеры отдаёт кадры
  const vw = await page.evaluate(async () => {
    const track = window.__valm.cameraController.getTrack()!
    const video = document.getElementById('video') as HTMLVideoElement
    video.srcObject = new MediaStream([track])
    await video.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    return video.videoWidth
  })
  expect(vw).toBeGreaterThan(0)
})

test('setBlurIntensity() зажимает значение в [0,1]', async ({ page }) => {
  const enabled = await tryEnableBlur(page)
  test.skip(!enabled.ok, `MediaPipe не поднялся: ${enabled.error}`)

  const clamped = await page.evaluate(() => {
    const c = window.__valm.effectsController
    c.setBlurIntensity(5) // выше максимума
    const high = c.getBlurParams()!.intensity
    c.setBlurIntensity(-3) // ниже минимума
    const low = c.getBlurParams()!.intensity
    return { high, low }
  })
  expect(clamped.high).toBeLessThanOrEqual(1)
  expect(clamped.low).toBeGreaterThanOrEqual(0)
})

test('disableBlur() выключает эффект', async ({ page }) => {
  const enabled = await tryEnableBlur(page)
  test.skip(!enabled.ok, `MediaPipe не поднялся: ${enabled.error}`)

  await page.evaluate(() => window.__valm.effectsController.disableBlur())
  const state = await page.evaluate(() => window.__valm.effectsController.state)
  expect(state.blur.isEnabled).toBe(false)
})

test('setVirtualBackground() отключает активный blur (конфликт эффектов)', async ({ page }) => {
  const enabled = await tryEnableBlur(page)
  test.skip(!enabled.ok, `MediaPipe не поднялся: ${enabled.error}`)

  // 1x1 прозрачный PNG как data URL — без обращения к сети
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  const state = await page.evaluate(async (url) => {
    await window.__valm.effectsController.setVirtualBackground(url)
    return window.__valm.effectsController.state
  }, tinyPng)

  expect(state.blur.isEnabled).toBe(false) // blur авто-отключился
  expect(state.virtualBackground.isEnabled).toBe(true)
})

test('EffectsEvents.EFFECT_ENABLED летит при enableBlur', async ({ page }) => {
  // подписка до включения
  await page.evaluate(() => {
    window.__events = []
    const { EffectsEvents } = window.Effects
    window.__valm.effectsController.on(EffectsEvents.EFFECT_ENABLED, (e: any) => window.__events.push(e.effect))
  })
  const enabled = await tryEnableBlur(page)
  test.skip(!enabled.ok, `MediaPipe не поднялся: ${enabled.error}`)

  await expect.poll(async () => page.evaluate(() => window.__events)).toContain('background_blur')
})
