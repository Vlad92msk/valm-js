import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Снимок кадра с камеры: captureFrame / captureFrameDataURL / captureFrameToCanvas.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('captureFrame() отдаёт непустой Blob формата image/png по умолчанию', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const result = await page.evaluate(async () => {
    const blob = await window.__valm.cameraController.captureFrame()
    return { type: blob.type, size: blob.size }
  })

  expect(result.type).toBe('image/png')
  expect(result.size).toBeGreaterThan(0)
})

test('captureFrame({ format: "image/jpeg" }) кодирует в jpeg', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const type = await page.evaluate(async () => {
    const blob = await window.__valm.cameraController.captureFrame({ format: 'image/jpeg', quality: 0.8 })
    return blob.type
  })

  expect(type).toBe('image/jpeg')
})

test('captureFrame({ width }) даунскейлит кадр с сохранением пропорций', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const native = await page.evaluate(() => {
    const s = window.__valm.cameraController.getTrack()!.getSettings()
    return { w: s.width, h: s.height }
  })

  const scaled = await page.evaluate(async () => {
    const blob = await window.__valm.cameraController.captureFrame({ width: 160 })
    const bmp = await createImageBitmap(blob)
    return { w: bmp.width, h: bmp.height }
  })

  expect(scaled.w).toBe(160)
  // высота пересчитана по соотношению сторон нативного трека
  const expectedH = Math.round((native.h! * 160) / native.w!)
  expect(scaled.h).toBe(expectedH)
})

test('captureFrameDataURL() возвращает data-URL кадра', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const url = await page.evaluate(() => window.__valm.cameraController.captureFrameDataURL())
  expect(url.startsWith('data:image/png')).toBe(true)
  expect(url.length).toBeGreaterThan(100)
})

test('captureFrameToCanvas() после прогрева рисует кадр в canvas нативного размера', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const native = await page.evaluate(() => {
    const s = window.__valm.cameraController.getTrack()!.getSettings()
    return { w: s.width, h: s.height }
  })

  // Первый синхронный вызов может бросить «кадр ещё не готов» — он прогревает
  // внутренний <video>. Ждём, пока следующий вызов вернёт размеры.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          try {
            const c = window.__valm.cameraController.captureFrameToCanvas()
            return c.width
          } catch {
            return 0
          }
        }),
      { timeout: 8000 },
    )
    .toBe(native.w)
})

test('captureFrame() без активного трека отклоняется и шлёт onError', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    const events: any[] = []
    window.__valm.cameraController.onError((e: any) => events.push(e))
    let rejected = false
    try {
      await window.__valm.cameraController.captureFrame()
    } catch {
      rejected = true
    }
    return { rejected, actions: events.map((e) => e.action) }
  })

  expect(outcome.rejected).toBe(true)
  expect(outcome.actions).toContain('captureFrame')
})
