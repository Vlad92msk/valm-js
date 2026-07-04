import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'

// Виртуальный фон: цвет/изображение, fitMode, updateVirtualBackgroundParams.
// Пиксельные проверки надёжны: у безликой фейковой камеры сегментация даёт «весь фон»,
// поэтому выход целиком = нарисованный фон. ML-части гейтятся skip.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => window.__valm.use(new window.Effects.EffectsPlugin()))
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

// Отрисовать текущий выходной трек в canvas и снять RGB нескольких точек.
async function samplePixels(page: Page, points: Array<[string, number, number]>): Promise<Record<string, number[]> & { vw: number }> {
  return page.evaluate(async (pts) => {
    const track = window.__valm.cameraController.getTrack()!
    const video = document.getElementById('video') as HTMLVideoElement
    video.srcObject = new MediaStream([track])
    await video.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 700))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const cx = canvas.getContext('2d')!
    cx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const out: any = { vw: video.videoWidth }
    for (const [name, fx, fy] of pts as Array<[string, number, number]>) {
      const x = Math.round(fx * canvas.width)
      const y = Math.round(fy * canvas.height)
      out[name] = Array.from(cx.getImageData(x, y, 1, 1).data).slice(0, 3)
    }
    return out
  }, points)
}

async function ensureBackgroundReady(page: Page): Promise<{ ok: boolean; error: string }> {
  return page.evaluate(async () => {
    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.setVirtualBackgroundColor('rgb(0,0,255)')
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
}

test('setVirtualBackgroundColor() заливает весь кадр цветом и отключает blur', async ({ page }) => {
  // включаем blur заранее, чтобы проверить авто-отключение
  await page.evaluate(async () => {
    await window.__valm.cameraController.enable()
    await window.__valm.effectsController.enableBlur().catch(() => {})
  })
  const ready = await page.evaluate(async () => {
    try {
      await window.__valm.effectsController.setVirtualBackgroundColor('rgb(0,0,255)')
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
  test.skip(!ready.ok, `MediaPipe segmentation не поднялся: ${ready.error}`)

  const px = await samplePixels(page, [
    ['center', 0.5, 0.5],
    ['tl', 0.05, 0.05],
    ['br', 0.95, 0.95],
  ])
  expect(px.vw).toBeGreaterThan(0)
  // весь кадр синий (нет человека → весь фон)
  for (const name of ['center', 'tl', 'br']) {
    expect(px[name][2]).toBeGreaterThan(180) // B высокий
    expect(px[name][0]).toBeLessThan(80) // R низкий
    expect(px[name][1]).toBeLessThan(80) // G низкий
  }
  // blur авто-отключился, активен виртуальный фон
  const state = await getState(page)
  expect(state.effects.blur.isEnabled).toBe(false)
  expect(state.effects.virtualBackground.isEnabled).toBe(true)
})

test('setVirtualBackgroundFitMode: STRETCH заполняет кадр, CONTAIN даёт letterbox цветом', async ({ page }) => {
  const ready = await ensureBackgroundReady(page)
  test.skip(!ready.ok, `MediaPipe segmentation не поднялся: ${ready.error}`)

  // широкое (4:1) красное изображение + синий фон-цвет для letterbox
  await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 2
    const cx = c.getContext('2d')!
    cx.fillStyle = 'rgb(255,0,0)'
    cx.fillRect(0, 0, 8, 2)
    const url = c.toDataURL('image/png')
    const eff = window.__valm.effectsController
    await eff.setVirtualBackground(url)
    eff.updateVirtualBackgroundParams({ backgroundColor: 'rgb(0,0,255)', edgeSmoothing: false })
    eff.setVirtualBackgroundFitMode(window.Effects.BackgroundFitMode.STRETCH)
  })

  // STRETCH: красный по всему кадру, включая верх
  let px = await samplePixels(page, [
    ['center', 0.5, 0.5],
    ['top', 0.5, 0.06],
  ])
  expect(px.center[0]).toBeGreaterThan(150) // R
  expect(px.top[0]).toBeGreaterThan(150) // верх тоже красный

  // CONTAIN: изображение вписано по ширине → центр красный, верх/низ = синий letterbox
  await page.evaluate(() => window.__valm.effectsController.setVirtualBackgroundFitMode(window.Effects.BackgroundFitMode.CONTAIN))
  px = await samplePixels(page, [
    ['center', 0.5, 0.5],
    ['top', 0.5, 0.04],
    ['bottom', 0.5, 0.96],
  ])
  expect(px.center[0]).toBeGreaterThan(150) // центр красный
  expect(px.top[2]).toBeGreaterThan(150) // верхний letterbox синий
  expect(px.bottom[2]).toBeGreaterThan(150) // нижний letterbox синий
  expect(px.top[0]).toBeLessThan(100) // верх НЕ красный
})

test('updateVirtualBackgroundParams() мёржит параметры, не затирая прочие', async ({ page }) => {
  const ready = await ensureBackgroundReady(page)
  test.skip(!ready.ok, `MediaPipe segmentation не поднялся: ${ready.error}`)

  const params = await page.evaluate(() => {
    const eff = window.__valm.effectsController
    eff.updateVirtualBackgroundParams({ fitMode: window.Effects.BackgroundFitMode.TILE })
    eff.updateVirtualBackgroundParams({ edgeBlur: 5 })
    return eff.getVirtualBackgroundParams()
  })
  // оба обновления применились, backgroundColor из ensureBackgroundReady сохранён
  expect(params.fitMode).toBe('tile')
  expect(params.edgeBlur).toBe(5)
  expect(params.backgroundColor).toBe('rgb(0,0,255)')
})

test('setVirtualBackgroundFitMode принимает все режимы (COVER/CONTAIN/STRETCH/TILE)', async ({ page }) => {
  const ready = await ensureBackgroundReady(page)
  test.skip(!ready.ok, `MediaPipe segmentation не поднялся: ${ready.error}`)

  const modes = await page.evaluate(() => {
    const eff = window.__valm.effectsController
    const { BackgroundFitMode } = window.Effects
    const results: Record<string, string> = {}
    for (const m of [BackgroundFitMode.COVER, BackgroundFitMode.CONTAIN, BackgroundFitMode.STRETCH, BackgroundFitMode.TILE]) {
      eff.setVirtualBackgroundFitMode(m)
      results[m] = eff.getVirtualBackgroundParams()!.fitMode
    }
    return results
  })
  expect(modes).toEqual({ cover: 'cover', contain: 'contain', stretch: 'stretch', tile: 'tile' })
})
