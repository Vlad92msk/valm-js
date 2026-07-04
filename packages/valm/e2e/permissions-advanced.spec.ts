import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Доп. контракты permissions.md: ветка denied (Permissions API), реакция
// onPermissionChange на 'change', fallback requestAll() при провале совместного запроса.
// Под --use-fake-ui разрешения авто-грантятся, поэтому denied эмулируем моками.

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('checkPermission возвращает denied и onPermissionChange ловит переход', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    // Подменяем Permissions API управляемым PermissionStatus
    const status: any = new EventTarget()
    status.state = 'prompt'
    ;(window as any).__permStatus = status
    navigator.permissions.query = (async (desc: any) => {
      return desc.name === 'camera' ? status : Object.assign(new EventTarget(), { state: 'granted' })
    }) as any

    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    const perms = window.__valm.permissions

    const initial = await perms.checkPermission('camera')

    const changes: string[] = []
    perms.onPermissionChange('camera', (s: string) => changes.push(s))

    // эмулируем отзыв доступа
    status.state = 'denied'
    status.dispatchEvent(new Event('change'))

    const afterChange = await perms.checkPermission('camera')
    return { initial, changes, afterChange }
  })

  expect(result.initial).toBe('prompt')
  expect(result.changes).toContain('denied') // onPermissionChange сработал
  expect(result.afterChange).toBe('denied')
})

test('checkPermission через devices-fallback отдаёт denied при отсутствии устройств', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    // Роняем Permissions API → сервис уходит в checkPermissionViaDevices
    navigator.permissions.query = (async () => {
      throw new Error('no permissions api')
    }) as any
    // Нет видео-устройств → 'denied'
    navigator.mediaDevices.enumerateDevices = (async () => {
      return [{ kind: 'audioinput', deviceId: 'x', label: 'mic', groupId: '' }] as any
    }) as any

    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    return window.__valm.permissions.checkPermission('camera')
  })
  expect(result).toBe('denied')
})

test('requestAll() падает на совместном запросе и добирает по отдельности (fallback)', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    let combinedCalls = 0
    let separateCalls = 0
    navigator.mediaDevices.getUserMedia = (async (c: MediaStreamConstraints) => {
      if (c.video && c.audio) {
        combinedCalls++
        throw new DOMException('cannot open both', 'NotReadableError')
      }
      separateCalls++
      return orig(c)
    }) as any

    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    const res = await window.__valm.permissions.requestAll()
    return { res, combinedCalls, separateCalls }
  })

  expect(result.combinedCalls).toBe(1) // сначала пробуем совместно
  expect(result.separateCalls).toBe(2) // затем по отдельности video + audio
  expect(result.res).toEqual({ camera: true, microphone: true })
})

test('checkAll() возвращает статусы обоих типов', async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  const result = await page.evaluate(() => window.__valm.permissions.checkAll())
  expect(result).toHaveProperty('camera')
  expect(result).toHaveProperty('microphone')
  expect(['granted', 'prompt', 'denied', 'unknown']).toContain(result.camera)
  expect(['granted', 'prompt', 'denied', 'unknown']).toContain(result.microphone)
})
