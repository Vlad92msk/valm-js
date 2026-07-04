import { test, expect } from '@playwright/test'
import { gotoFixture, newInitializedValm, destroyValm } from './helpers/setup'

// Контракты из guides/devices.md.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  // инициализируем, чтобы получить label устройств (иначе браузер их прячет)
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('getAvailable() возвращает непустые списки камер и микрофонов', async ({ page }) => {
  const devices = await page.evaluate(() => window.__valm.devicesController.getAvailable())
  expect(Array.isArray(devices.cameras)).toBe(true)
  expect(Array.isArray(devices.microphones)).toBe(true)
  expect(Array.isArray(devices.speakers)).toBe(true)
  expect(devices.cameras.length).toBeGreaterThanOrEqual(1)
  expect(devices.microphones.length).toBeGreaterThanOrEqual(1)
  // MediaDeviceInfo имеет стандартные поля
  expect(devices.cameras[0]).toHaveProperty('deviceId')
  expect(devices.cameras[0]).toHaveProperty('kind')
  expect(devices.cameras[0].kind).toBe('videoinput')
})

test('state отражает те же списки, что и getAvailable()', async ({ page }) => {
  const same = await page.evaluate(async () => {
    await window.__valm.devicesController.getAvailable()
    const s = window.__valm.devicesController.state
    return { cams: s.cameras.length, mics: s.microphones.length }
  })
  expect(same.cams).toBeGreaterThanOrEqual(1)
  expect(same.mics).toBeGreaterThanOrEqual(1)
})

test('checkPermissions() возвращает статусы для камеры и микрофона', async ({ page }) => {
  const perms = await page.evaluate(() => window.__valm.devicesController.checkPermissions())
  expect(perms).toHaveProperty('camera')
  expect(perms).toHaveProperty('microphone')
  expect(['granted', 'denied', 'prompt', 'unknown']).toContain(perms.camera)
  expect(['granted', 'denied', 'prompt', 'unknown']).toContain(perms.microphone)
})

test('onChange возвращает функцию отписки (smoke)', async ({ page }) => {
  const isFn = await page.evaluate(() => typeof window.__valm.devicesController.onChange(() => {}) === 'function')
  expect(isFn).toBe(true)
})

test('AudioOutputController: getOutputState() и isOutputSelectionSupported()', async ({ page }) => {
  const info = await page.evaluate(() => {
    const ao = window.__valm.audioOutputController
    return {
      state: ao.getOutputState(),
      supportedType: typeof ao.isOutputSelectionSupported(),
    }
  })
  expect(info.state).toHaveProperty('deviceId')
  expect(info.supportedType).toBe('boolean')
})

test('AudioOutputController.onChange немедленно вызывает коллбэк с текущим состоянием', async ({ page }) => {
  const immediate = await page.evaluate(() => {
    let state: any = null
    window.__valm.audioOutputController.onChange((s: any) => (state = s))
    return state
  })
  expect(immediate).not.toBeNull()
  expect(immediate).toHaveProperty('deviceId')
})
