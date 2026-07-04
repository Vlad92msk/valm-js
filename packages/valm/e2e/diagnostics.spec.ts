import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'

// Единый pre-call диагностический флоу: media.diagnostics.run() + onStep.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('run() возвращает полный отчёт по браузеру, камере, микрофону и динамику', async ({ page }) => {
  const report = await page.evaluate(() => window.__valm.diagnostics.run())

  expect(report.browser.supported).toBe(true)
  expect(report.browser.getUserMedia).toBe(true)
  expect(report.browser.getDisplayMedia).toBe(true)

  expect(report.permissions).toHaveProperty('camera')
  expect(report.permissions).toHaveProperty('microphone')

  expect(report.camera.ok).toBe(true)
  expect(report.camera.resolution?.width).toBeGreaterThan(0)
  expect(report.camera.resolution?.height).toBeGreaterThan(0)

  expect(report.microphone.ok).toBe(true)
  expect(typeof report.microphone.peakVolume).toBe('number')

  expect(report.speaker.testPlayed).toBe(true)
  expect(report.speaker.ok).toBe(true)
})

test('run() учитывает выключенные разделы (только браузер + permissions)', async ({ page }) => {
  const report = await page.evaluate(() => window.__valm.diagnostics.run({ camera: false, microphone: false, speaker: false }))

  // разделы не запускались — остаются в дефолтном (не ok) состоянии
  expect(report.browser.supported).toBe(true)
  expect(report.camera.ok).toBe(false)
  expect(report.microphone.ok).toBe(false)
  expect(report.speaker.testPlayed).toBe(false)
})

test('onStep() шлёт шаги в правильном порядке со статусами running→ok', async ({ page }) => {
  const steps = await page.evaluate(async () => {
    const collected: any[] = []
    const off = window.__valm.diagnostics.onStep((s: any) => collected.push(s))
    await window.__valm.diagnostics.run()
    off()
    return collected
  })

  const names = steps.map((s) => s.name)
  // порядок разделов: браузер → разрешения → камера → микрофон → динамик
  expect(names.indexOf('browser')).toBeLessThan(names.indexOf('permissions'))
  expect(names.indexOf('permissions')).toBeLessThan(names.indexOf('camera'))
  expect(names.indexOf('camera')).toBeLessThan(names.indexOf('microphone'))
  expect(names.indexOf('microphone')).toBeLessThan(names.indexOf('speaker'))

  // каждый раздел проходит через running и финальный статус
  const cameraStatuses = steps.filter((s) => s.name === 'camera').map((s) => s.status)
  expect(cameraStatuses[0]).toBe('running')
  expect(cameraStatuses).toContain('ok')
})

test('run() очищает за собой ресурсы — превью не остаётся активным', async ({ page }) => {
  await page.evaluate(() => window.__valm.diagnostics.run())

  const state = await getState(page)
  expect(state.camera.isPreviewing).toBe(false)
  expect(state.microphone.isPreviewing).toBe(false)
})
