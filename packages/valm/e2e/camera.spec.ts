import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'
import { inspectTrack } from './helpers/media'

// Контракты из guides/camera.md.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('enable() поднимает живой видео-трек, disable() его останавливает', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  let track = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(track.exists).toBe(true)
  expect(track.kind).toBe('video')
  expect(track.readyState).toBe('live')
  expect((await getState(page)).camera.isEnabled).toBe(true)

  await page.evaluate(() => window.__valm.cameraController.disable())
  track = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(track.exists).toBe(false)
  expect((await getState(page)).camera.isEnabled).toBe(false)
})

test('toggle() переключает состояние камеры', async ({ page }) => {
  expect((await getState(page)).camera.isEnabled).toBe(false)
  await page.evaluate(() => window.__valm.cameraController.toggle())
  expect((await getState(page)).camera.isEnabled).toBe(true)
  await page.evaluate(() => window.__valm.cameraController.toggle())
  expect((await getState(page)).camera.isEnabled).toBe(false)
})

test('updateResolution() реально меняет track.getSettings()', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  await page.evaluate(() => window.__valm.cameraController.updateResolution(640, 480))
  await expect
    .poll(async () => (await inspectTrack(page, 'window.__valm.cameraController.getTrack()')).settings.width)
    .toBe(640)

  await page.evaluate(() => window.__valm.cameraController.updateResolution(320, 240))
  await expect
    .poll(async () => (await inspectTrack(page, 'window.__valm.cameraController.getTrack()')).settings.width)
    .toBe(320)
})

test('updateFrameRate() отражается в конфигурации и не роняет трек', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  await page.evaluate(() => window.__valm.cameraController.updateFrameRate(15))

  expect(await page.evaluate(() => window.__valm.cameraController.getConfiguration().frameRate)).toBe(15)
  await expect
    .poll(async () => (await inspectTrack(page, 'window.__valm.cameraController.getTrack()')).readyState)
    .toBe('live')
})

test('preview() создаёт отдельный трек и не трогает основной', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const mainBefore = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')

  const previewInfo = await page.evaluate(async () => {
    const track = await window.__valm.cameraController.preview()
    ;(window as any).__preview = track
    return { kind: track.kind, readyState: track.readyState }
  })
  expect(previewInfo.kind).toBe('video')
  expect(previewInfo.readyState).toBe('live')

  // Основной трек не изменился (это другой объект, но всё ещё живой) и isPreviewing = true
  const mainAfter = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(mainAfter.readyState).toBe('live')
  expect(mainAfter.exists).toBe(true)
  expect((await getState(page)).camera.isPreviewing).toBe(true)

  // preview-трек — отдельный объект, не равен основному
  const distinct = await page.evaluate(() => (window as any).__preview !== window.__valm.cameraController.getTrack())
  expect(distinct).toBe(true)
  expect(mainBefore.exists).toBe(true)
})

test('stopPreview() останавливает превью без публикации', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  await page.evaluate(async () => {
    ;(window as any).__preview = await window.__valm.cameraController.preview()
  })
  expect((await getState(page)).camera.isPreviewing).toBe(true)

  await page.evaluate(() => window.__valm.cameraController.stopPreview())
  expect((await getState(page)).camera.isPreviewing).toBe(false)
  const previewState = await page.evaluate(() => (window as any).__preview.readyState)
  expect(previewState).toBe('ended')
})

test('publishPreview() заменяет основной трек на превью', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const { previewId, oldMainId } = await page.evaluate(async () => {
    const oldMain = window.__valm.cameraController.getTrack()
    const preview = await window.__valm.cameraController.preview()
    ;(window as any).__preview = preview
    return { previewId: preview.id, oldMainId: oldMain?.id }
  })

  await page.evaluate(() => window.__valm.cameraController.publishPreview())

  const newMainId = await page.evaluate(() => window.__valm.cameraController.getTrack()?.id)
  expect(newMainId).toBe(previewId)
  expect(newMainId).not.toBe(oldMainId)
  expect((await getState(page)).camera.isPreviewing).toBe(false)
  expect((await getState(page)).camera.isEnabled).toBe(true)
})

test('onStateChange получает CameraState при enable/disable', async ({ page }) => {
  await page.evaluate(() => {
    window.__events = []
    window.__valm.cameraController.onStateChange((s: any) => window.__events.push(s))
  })
  await page.evaluate(() => window.__valm.cameraController.enable())
  await page.evaluate(() => window.__valm.cameraController.disable())

  const events = await page.evaluate(() => window.__events)
  expect(events.length).toBeGreaterThan(0)
  // хотя бы одно событие с isEnabled=true и одно с false
  expect(events.some((s: any) => s.isEnabled === true)).toBe(true)
  expect(events.some((s: any) => s.isEnabled === false)).toBe(true)
  // payload имеет форму CameraState
  expect(events[0]).toHaveProperty('isPreviewing')
  expect(events[0]).toHaveProperty('hasDevice')
})

// onTrackReplaced требует РЕАЛЬНОЙ смены устройства (переключение на тот же deviceId —
// осознанный no-op в video-track-manager). Под фейковыми устройствами доступна лишь
// одна камера, поэтому реальную замену трека камеры не спровоцировать — контракт
// onTrackReplaced покрыт в microphone.spec.ts (3 фейковых микрофона). Здесь лишь
// проверяем, что подписка регистрируется и возвращает функцию отписки.
test('onTrackReplaced возвращает функцию отписки', async ({ page }) => {
  const cameraCount = await page.evaluate(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices()
    return devs.filter((d) => d.kind === 'videoinput').length
  })
  test.skip(cameraCount < 2, 'Нужны минимум 2 камеры для реальной смены устройства (fake env даёт одну)')

  const isFn = await page.evaluate(() => typeof window.__valm.cameraController.onTrackReplaced(() => {}) === 'function')
  expect(isFn).toBe(true)
})
