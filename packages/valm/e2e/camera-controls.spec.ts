import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Продвинутое управление камерой: capabilities + zoom / torch / focus / exposure.
// Фейковая камера Chromium не поддерживает эти возможности — проверяем корректный
// no-op-контракт (понятная ошибка + onError) и форму getAdvancedState().

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('getCapabilities() возвращает null пока камера выключена', async ({ page }) => {
  const caps = await page.evaluate(() => window.__valm.cameraController.getCapabilities())
  expect(caps).toBeNull()
})

test('getCapabilities() возвращает объект возможностей на включённой камере', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const caps = await page.evaluate(() => window.__valm.cameraController.getCapabilities())
  expect(caps).not.toBeNull()
  expect(typeof caps).toBe('object')
})

test('getAdvancedState() имеет полную форму (zoom/torch/focus/exposure)', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const state = await page.evaluate(() => window.__valm.cameraController.getAdvancedState())

  expect(state).toHaveProperty('zoom.supported')
  expect(state).toHaveProperty('torch.supported')
  expect(state).toHaveProperty('focus.supported')
  expect(state).toHaveProperty('exposure.supported')
  expect(typeof state.zoom.supported).toBe('boolean')
  expect(typeof state.torch.on).toBe('boolean')
})

test('setZoom() на неподдерживающем устройстве отклоняется и шлёт onError', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const supported = await page.evaluate(() => window.__valm.cameraController.getAdvancedState().zoom.supported)
  test.skip(supported, 'Устройство поддерживает zoom — контракт no-op неприменим')

  const outcome = await page.evaluate(async () => {
    const events: any[] = []
    window.__valm.cameraController.onError((e: any) => events.push(e))
    let message = ''
    try {
      await window.__valm.cameraController.setZoom(2)
    } catch (e: any) {
      message = e.message
    }
    return { message, actions: events.map((e) => e.action) }
  })

  expect(outcome.message).toContain('zoom')
  expect(outcome.actions).toContain('setZoom')
})

test('toggleTorch() на неподдерживающем устройстве отклоняется с понятной ошибкой', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const supported = await page.evaluate(() => window.__valm.cameraController.getAdvancedState().torch.supported)
  test.skip(supported, 'Устройство поддерживает torch — контракт no-op неприменим')

  const rejected = await page.evaluate(async () => {
    try {
      await window.__valm.cameraController.toggleTorch(true)
      return false
    } catch {
      return true
    }
  })

  expect(rejected).toBe(true)
})

test('setFocusMode() с неподдерживаемым режимом отклоняется', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const outcome = await page.evaluate(async () => {
    const supported = window.__valm.cameraController.getAdvancedState().focus.supported
    try {
      await window.__valm.cameraController.setFocusMode('manual')
      return { supported, rejected: false }
    } catch {
      return { supported, rejected: true }
    }
  })

  // если фокус не поддержан — метод обязан отклониться
  if (!outcome.supported) expect(outcome.rejected).toBe(true)
})
