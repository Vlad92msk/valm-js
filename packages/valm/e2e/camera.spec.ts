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

test('switchDevice() с эффектом: при ошибке gUM выходной трек остаётся живым, deviceId откатывается', async ({ page }) => {
  await page.evaluate(() => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c: any) => {
      if (c?.video?.deviceId?.exact === 'bad') throw new DOMException('busy', 'NotReadableError')
      return orig(c?.video ? { video: { ...c.video, deviceId: undefined } } : c)
    }
  })
  const r = await page.evaluate(async () => {
    const v = window.__valm
    v.use(new window.Effects.EffectsPlugin())
    await v.cameraController.enable()
    await v.effectsController.enableBlur()
    await new Promise((res) => setTimeout(res, 300))
    const out = v.cameraController.getTrack()
    const prevId = v.cameraController.getConfiguration().deviceId
    const err = await v.cameraController.switchDevice('bad').then(() => null, (e: any) => e.name)
    return {
      err,
      outLive: out?.readyState,
      same: v.cameraController.getTrack() === out,
      rolledBack: v.cameraController.getConfiguration().deviceId === prevId,
    }
  })
  expect(r).toEqual({ err: 'NotReadableError', outLive: 'live', same: true, rolledBack: true })
})

// Смена камеры при работающем pipeline: меняется только вход, публикуемый трек тот же
async function switchWithPipeline(page: import('@playwright/test').Page, withSwitchInput: boolean) {
  return page.evaluate(async (seamless) => {
    const v = window.__valm
    v.use(new window.Effects.EffectsPlugin())
    await v.cameraController.enable()
    await v.effectsController.enableBlur()
    await new Promise((res) => setTimeout(res, 300))
    const manager = v.mediaStreamService.getVideoTrackManager()
    if (!seamless) manager.getPipeline().switchInput = undefined
    v.mediaStreamService.muteVideo()

    const out = v.cameraController.getTrack()
    const raw = manager.getRawTrack()
    let replaced = 0
    v.cameraController.onTrackReplaced(() => replaced++)

    const result = await v.cameraController.reacquire()
    const newOut = v.cameraController.getTrack()
    const muted = newOut.enabled === false && manager.getRawTrack().enabled === false

    // Кадры идут и после смены входа
    v.mediaStreamService.unmuteVideo()
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = new MediaStream([newOut])
    await video.play()
    const gotFrame = await Promise.race([
      new Promise<boolean>((res) => video.requestVideoFrameCallback(() => res(true))),
      new Promise<boolean>((res) => setTimeout(() => res(false), 3000)),
    ])
    video.srcObject = null

    return {
      applied: result.applied,
      sameOutput: newOut === out,
      outLive: newOut.readyState,
      rawChanged: manager.getRawTrack() !== raw,
      oldRaw: raw.readyState,
      replaced,
      muted,
      gotFrame,
      blur: v.effectsController.state.activeEffects.length,
    }
  }, withSwitchInput)
}

test('switchDevice() с эффектом: выходной трек не меняется, onTrackReplaced не летит', async ({ page }) => {
  const r = await switchWithPipeline(page, true)
  expect(r).toEqual({ applied: true, sameOutput: true, outLive: 'live', rawChanged: true, oldRaw: 'ended', replaced: 0, muted: true, gotFrame: true, blur: 1 })
})

test('switchDevice() с pipeline без switchInput: перезапуск pipeline и onTrackReplaced', async ({ page }) => {
  const r = await switchWithPipeline(page, false)
  expect(r).toEqual({ applied: true, sameOutput: false, outLive: 'live', rawChanged: true, oldRaw: 'ended', replaced: 1, muted: true, gotFrame: true, blur: 1 })
})

test('мобильный switchDevice() с эффектом: выходной трек тот же и при успехе, и при возврате на прежнюю камеру', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    })
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c: any) => {
      if (c?.video?.deviceId?.exact === 'bad') throw new DOMException('busy', 'NotReadableError')
      return orig(c?.video ? { video: { ...c.video, deviceId: undefined } } : c)
    }
  })
  const r = await page.evaluate(async () => {
    const v = window.__valm
    v.use(new window.Effects.EffectsPlugin())
    await v.cameraController.enable()
    await v.effectsController.enableBlur()
    await new Promise((res) => setTimeout(res, 300))
    const manager = v.mediaStreamService.getVideoTrackManager()
    const out = v.cameraController.getTrack()
    let replaced = 0
    v.cameraController.onTrackReplaced(() => replaced++)

    const raw1 = manager.getRawTrack()
    const ok = await v.cameraController.reacquire()
    const raw2 = manager.getRawTrack()
    const err = await v.cameraController.switchDevice('bad').then(() => null, (e: any) => e.name)
    const raw3 = manager.getRawTrack()

    return {
      isMobile: window.Valm.DeviceDetector.isMobile(),
      applied: ok.applied,
      err,
      sameOutput: v.cameraController.getTrack() === out,
      outLive: out.readyState,
      raws: [raw1 !== raw2, raw2 !== raw3, raw3?.readyState],
      enabled: v.cameraController.state.isEnabled,
      running: manager.getPipeline().isRunning(),
      replaced,
    }
  })
  expect(r).toEqual({
    isMobile: true,
    applied: true,
    err: 'NotReadableError',
    sameOutput: true,
    outLive: 'live',
    raws: [true, true, 'live'],
    enabled: true,
    running: true,
    replaced: 0,
  })
})
