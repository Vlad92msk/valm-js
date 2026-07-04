import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/events.md — события уровня Valm (TypedEventEmitter).

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('videoStateChanged летит при enable камеры и содержит MediaStreamState', async ({ page }) => {
  const state = await page.evaluate(async () => {
    let captured: any = null
    window.__valm.on('videoStateChanged', (s: any) => (captured = s))
    await window.__valm.cameraController.enable()
    return captured
  })
  expect(state).not.toBeNull()
  // форма MediaStreamState (весь стрим)
  expect(state).toHaveProperty('hasVideo')
  expect(state).toHaveProperty('isVideoEnabled')
  expect(state).toHaveProperty('hasAudio')
  expect(state).toHaveProperty('currentVideoDevice')
  expect(state.hasVideo).toBe(true)
  expect(state.isVideoEnabled).toBe(true)
})

test('videoDisabled летит при camera.disable()', async ({ page }) => {
  const fired = await page.evaluate(async () => {
    await window.__valm.cameraController.enable()
    let called = false
    window.__valm.on('videoDisabled', () => (called = true))
    window.__valm.cameraController.disable()
    return called
  })
  expect(fired).toBe(true)
})

test('audioDisabled летит при mic.disable()', async ({ page }) => {
  const fired = await page.evaluate(async () => {
    await window.__valm.microphoneController.enable()
    let called = false
    window.__valm.on('audioDisabled', () => (called = true))
    window.__valm.microphoneController.disable()
    return called
  })
  expect(fired).toBe(true)
})

test('mediaReset летит при resetMedia()', async ({ page }) => {
  const fired = await page.evaluate(async () => {
    await window.__valm.cameraController.enable()
    let called = false
    window.__valm.on('mediaReset', () => (called = true))
    await window.__valm.resetMedia()
    return called
  })
  expect(fired).toBe(true)
})

test('unsubscribe реально отписывает от события Valm', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let count = 0
    const unsub = window.__valm.on('videoStateChanged', () => count++)
    await window.__valm.cameraController.enable()
    const afterFirst = count
    unsub()
    window.__valm.cameraController.disable()
    await window.__valm.cameraController.enable()
    return { afterFirst, afterUnsub: count }
  })
  expect(result.afterFirst).toBeGreaterThan(0)
  expect(result.afterUnsub).toBe(result.afterFirst)
})

test("error-событие летит при провале enable (getUserMedia отклонён)", async ({ page }) => {
  const errorEvent = await page.evaluate(async () => {
    // Подменяем getUserMedia, чтобы enable гарантированно упал
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))

    let captured: any = null
    window.__valm.on('error', (e: any) => (captured = e))

    try {
      await window.__valm.cameraController.enable()
    } catch {
      /* ожидаемо */
    }

    navigator.mediaDevices.getUserMedia = original
    return captured
      ? { source: captured.source, hasError: !!captured.error, action: captured.action }
      : null
  })

  expect(errorEvent).not.toBeNull()
  expect(errorEvent.hasError).toBe(true)
  // источник — из перечисления MediaErrorSource
  expect(['camera', 'camera/microphone', 'media-stream', 'initialization']).toContain(errorEvent.source)
})
