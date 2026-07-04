import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/permissions.md.
// Под --use-fake-ui-for-media-stream разрешения авто-грантятся, запросы не кидают.

const VALID_STATES = ['granted', 'denied', 'prompt', 'unknown']

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page)
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('checkPermission(camera|microphone) возвращает валидный статус', async ({ page }) => {
  const states = await page.evaluate(async () => ({
    camera: await window.__valm.permissions.checkPermission('camera'),
    microphone: await window.__valm.permissions.checkPermission('microphone'),
  }))
  expect(VALID_STATES).toContain(states.camera)
  expect(VALID_STATES).toContain(states.microphone)
})

test('checkAll() возвращает статусы обоих разрешений', async ({ page }) => {
  const all = await page.evaluate(() => window.__valm.permissions.checkAll())
  expect(all).toHaveProperty('camera')
  expect(all).toHaveProperty('microphone')
  expect(VALID_STATES).toContain(all.camera)
  expect(VALID_STATES).toContain(all.microphone)
})

test('requestPermission() не кидает под fake-ui и возвращает boolean', async ({ page }) => {
  const granted = await page.evaluate(() => window.__valm.permissions.requestPermission('camera'))
  expect(typeof granted).toBe('boolean')
  expect(granted).toBe(true) // fake-ui авто-грантит
})

test('requestAll() возвращает { camera, microphone } булевыми', async ({ page }) => {
  const result = await page.evaluate(() => window.__valm.permissions.requestAll())
  expect(typeof result.camera).toBe('boolean')
  expect(typeof result.microphone).toBe('boolean')
  expect(result.camera).toBe(true)
  expect(result.microphone).toBe(true)
})

test('onPermissionChange возвращает функцию отписки', async ({ page }) => {
  const isFn = await page.evaluate(
    () => typeof window.__valm.permissions.onPermissionChange('camera', () => {}) === 'function',
  )
  expect(isFn).toBe(true)
})
