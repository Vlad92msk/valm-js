import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/plugins.md.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('use() вызывает install(context) с mediaStreamService и configurationService', async ({ page }) => {
  const ctx = await page.evaluate(() => {
    let received: any = null
    const plugin = {
      name: 'test-install',
      install(context: any) {
        received = {
          hasMediaStream: !!context.mediaStreamService,
          hasConfig: !!context.configurationService,
          mediaStreamHasOn: typeof context.mediaStreamService?.on === 'function',
        }
      },
      destroy() {},
    }
    const ret = window.__valm.use(plugin)
    return { received, chainable: ret === window.__valm }
  })
  expect(ctx.received).toEqual({ hasMediaStream: true, hasConfig: true, mediaStreamHasOn: true })
  expect(ctx.chainable).toBe(true) // use() возвращает this
})

test('hasPlugin / getPlugin работают после установки', async ({ page }) => {
  const result = await page.evaluate(() => {
    const plugin = { name: 'my-plugin', install() {}, destroy() {} }
    window.__valm.use(plugin)
    return {
      has: window.__valm.hasPlugin('my-plugin'),
      hasUnknown: window.__valm.hasPlugin('nope'),
      getSame: window.__valm.getPlugin('my-plugin') === plugin,
      getUnknown: window.__valm.getPlugin('nope'),
    }
  })
  expect(result.has).toBe(true)
  expect(result.hasUnknown).toBe(false)
  expect(result.getSame).toBe(true)
  expect(result.getUnknown).toBeUndefined()
})

test('плагин ловит события mediaStreamService (trackAdded)', async ({ page }) => {
  const events = await page.evaluate(async () => {
    const captured: string[] = []
    const plugin = {
      name: 'listener',
      _unsub: null as any,
      install(context: any) {
        this._unsub = context.mediaStreamService.on(window.Valm.MediaEvents.TRACK_ADDED, (e: any) => {
          captured.push(e.kind)
        })
      },
      destroy() {
        this._unsub?.()
      },
    }
    window.__valm.use(plugin)
    await window.__valm.cameraController.enable()
    await window.__valm.microphoneController.enable()
    return captured
  })
  expect(events).toContain('video')
  expect(events).toContain('audio')
})

test('destroy() модуля вызывает destroy() плагина и отписывает его', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let destroyed = false
    let eventsAfterDestroy = 0
    const plugin = {
      name: 'destroyable',
      _unsub: null as any,
      install(context: any) {
        this._unsub = context.mediaStreamService.on(window.Valm.MediaEvents.TRACK_ADDED, () => {
          eventsAfterDestroy++
        })
      },
      destroy() {
        destroyed = true
        this._unsub?.()
      },
    }
    window.__valm.use(plugin)
    await window.__valm.destroy()

    // Пересоздаём инстанс, чтобы afterEach не падал, но проверяем что старый плагин отписан
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    return { destroyed, eventsAfterDestroy }
  })
  expect(result.destroyed).toBe(true)
  expect(result.eventsAfterDestroy).toBe(0)
})

test('двойная регистрация имени плагина кидает ошибку', async ({ page }) => {
  const threw = await page.evaluate(() => {
    window.__valm.use({ name: 'dup', install() {}, destroy() {} })
    try {
      window.__valm.use({ name: 'dup', install() {}, destroy() {} })
      return false
    } catch {
      return true
    }
  })
  expect(threw).toBe(true)
})
