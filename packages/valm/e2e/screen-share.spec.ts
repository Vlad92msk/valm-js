import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'
import { inspectTrack } from './helpers/media'

// Контракты из guides/screen-share.md.
// Под --auto-select-desktop-capture-source="Entire screen" getDisplayMedia не показывает
// диалог, а сразу отдаёт экран.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page)
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('start() отдаёт живой display-трек, stop() его глушит', async ({ page }) => {
  await page.evaluate(() => window.__valm.screenShareController.start())

  const track = await inspectTrack(page, 'window.__valm.screenShareController.getTrack()')
  expect(track.exists).toBe(true)
  expect(track.kind).toBe('video')
  expect(track.readyState).toBe('live')
  expect((await page.evaluate(() => window.__valm.screenShareController.state.isActive))).toBe(true)

  await page.evaluate(() => window.__valm.screenShareController.stop())
  expect((await page.evaluate(() => window.__valm.screenShareController.state.isActive))).toBe(false)
  const stream = await page.evaluate(() => window.__valm.screenShareController.getStream())
  expect(stream).toBeNull()
})

test('toggle() запускает и останавливает демонстрацию', async ({ page }) => {
  await page.evaluate(() => window.__valm.screenShareController.toggle())
  expect(await page.evaluate(() => window.__valm.screenShareController.state.isActive)).toBe(true)

  await page.evaluate(() => window.__valm.screenShareController.toggle())
  expect(await page.evaluate(() => window.__valm.screenShareController.state.isActive)).toBe(false)
})

test('updateDisplaySurface() пишет параметр в конфигурацию', async ({ page }) => {
  await page.evaluate(() => window.__valm.screenShareController.updateDisplaySurface('window'))
  const surface = await page.evaluate(() => window.__valm.screenShareController.getConfiguration().preferDisplaySurface)
  expect(surface).toBe('window')
})

// ВАЖНО: updateMode() пишет в конфиг только `mode`. Значения maxFrameRate/contentHint
// из пресета применяются при построении потока (screen-share.service), а не сохраняются
// в конфиг — поэтому проверяем ЭФФЕКТИВНОЕ поведение на реальном треке, а не поля конфига.
test('updateMode() применяет пресет к реальному display-треку', async ({ page }) => {
  // presentation → 5 FPS, contentHint='text'
  const presentation = await page.evaluate(async () => {
    const ss = window.__valm.screenShareController
    ss.updateMode('presentation')
    await ss.start()
    const track = ss.getTrack()!
    const res = { contentHint: track.contentHint, frameRate: track.getSettings().frameRate, mode: ss.getConfiguration().mode }
    ss.stop()
    return res
  })
  expect(presentation.mode).toBe('presentation')
  expect(presentation.contentHint).toBe('text')
  // maxFrameRate: { max: 5 } — фактический fps не должен превышать пресет (+запас на округление)
  expect(presentation.frameRate).toBeLessThanOrEqual(6)

  // video → contentHint='motion'
  const video = await page.evaluate(async () => {
    const ss = window.__valm.screenShareController
    ss.updateMode('video')
    await ss.start()
    const track = ss.getTrack()!
    const res = { contentHint: track.contentHint }
    ss.stop()
    return res
  })
  expect(video.contentHint).toBe('motion')
})

test('onStateChange шлёт ScreenShareState при старте', async ({ page }) => {
  const captured = await page.evaluate(async () => {
    const states: any[] = []
    window.__valm.screenShareController.onStateChange((s: any) => states.push({ isActive: s.isActive, hasStream: !!s.stream }))
    await window.__valm.screenShareController.start()
    await window.__valm.screenShareController.stop()
    return states
  })
  expect(captured.length).toBeGreaterThan(0)
  expect(captured.some((s) => s.isActive === true && s.hasStream === true)).toBe(true)
})

test('checkCapabilities() (static) сообщает о поддержке getDisplayMedia', async ({ page }) => {
  const result = await page.evaluate(() => window.Valm.ScreenShareController.checkCapabilities())
  expect(result).toHaveProperty('supported')
  expect(typeof result.supported).toBe('boolean')
  expect(result.supported).toBe(true) // headless Chromium поддерживает
})
