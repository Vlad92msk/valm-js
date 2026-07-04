import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Комбо-сценарии: одновременная работа нескольких подсистем и восстановление после ошибки.
// Именно на стыках (эффекты+запись, камера+экран+запись, suspend/resume пайплайна) прячутся
// интеграционные баги, которых не видно в изолированных спеках.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('камера + микрофон + screen-share + запись одновременно → непустой Blob', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.__valm.cameraController.enable()
    await window.__valm.microphoneController.enable()
    await window.__valm.screenShareController.start()

    const rec = window.__valm.recordingController
    await rec.startRecording({ autoSave: false, includeVideo: true, includeAudio: true, includeScreenShare: true })
    await new Promise((r) => setTimeout(r, 500))
    const blob = await rec.stopRecording()

    window.__valm.screenShareController.stop()
    return { size: blob.size, type: blob.type }
  })
  expect(result.size).toBeGreaterThan(0)
  expect(result.type).toContain('video/')
})

// Эффекты + пайплайн камеры. Процессор кадров бывает двух типов:
//  - insertable-streams: трансформация «на месте», идентичность трека сохраняется → onTrackReplaced НЕ летит;
//  - canvas: выход — новый captureStream-трек → onTrackReplaced летит.
// Проверяем корректный контракт для фактического процессора (в headless Chromium — insertable-streams).
test('эффекты: enableBlur запускает пайплайн; замена трека — по типу процессора', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
    const rawId = window.__valm.cameraController.getTrack()?.id

    const replaced: any[] = []
    window.__valm.cameraController.onTrackReplaced((e: any) =>
      replaced.push({ hasOld: !!e.oldTrack, hasNew: !!e.newTrack, source: e.source }),
    )

    try {
      await window.__valm.effectsController.enableBlur()
    } catch (e: any) {
      return { skipped: true, error: String(e?.message ?? e) }
    }
    await new Promise((r) => setTimeout(r, 400))
    const ps = window.__valm.effectsController.getPipelineState()
    return {
      skipped: false,
      replacedCount: replaced.length,
      replacedSources: replaced.map((r) => r.source),
      rawId,
      outId: window.__valm.cameraController.getTrack()?.id,
      processorType: ps?.processorType,
      isRunning: ps?.isRunning,
      activeEffects: window.__valm.effectsController.state.activeEffects,
    }
  })

  test.skip(result.skipped === true, `MediaPipe не поднялся: ${result.error}`)
  expect(result.isRunning).toBe(true)
  expect(result.activeEffects).toContain('background_blur')

  if (result.processorType === 'insertable-streams') {
    // трансформация на месте — трек тот же, событие замены не летит
    expect(result.outId).toBe(result.rawId)
    expect(result.replacedCount).toBe(0)
  } else {
    // canvas-процессор — трек подменяется, onTrackReplaced летит
    expect(result.outId).not.toBe(result.rawId)
    expect(result.replacedCount).toBeGreaterThan(0)
    // замена инициирована пайплайном эффектов, а не сменой устройства
    expect(result.replacedSources).toContain('background')
  }
})

test('эффекты + запись: пишется обработанный (блюр) трек, Blob непустой', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.enableBlur()
    } catch (e: any) {
      return { skipped: true, error: String(e?.message ?? e) }
    }
    const rec = window.__valm.recordingController
    await rec.startRecording({ autoSave: false, includeVideo: true, includeAudio: false })
    await new Promise((r) => setTimeout(r, 500))
    const blob = await rec.stopRecording()
    return { skipped: false, size: blob.size, fps: window.__valm.effectsController.state.currentFps }
  })
  test.skip(result.skipped === true, `MediaPipe не поднялся: ${result.error}`)
  expect(result.size).toBeGreaterThan(0)
})

test('восстановление после ошибки: enable падает, повторный enable — успешен', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    let failNext = true
    navigator.mediaDevices.getUserMedia = (c: MediaStreamConstraints) => {
      if (failNext) {
        failNext = false
        return Promise.reject(new DOMException('denied', 'NotAllowedError'))
      }
      return orig(c)
    }

    const errors: any[] = []
    window.__valm.on('error', (e: any) => errors.push(e.source))

    let firstFailed = false
    try {
      await window.__valm.cameraController.enable()
    } catch {
      firstFailed = true
    }

    // повторная попытка — getUserMedia уже работает
    await window.__valm.cameraController.enable()
    const track = window.__valm.cameraController.getTrack()
    navigator.mediaDevices.getUserMedia = orig
    return { firstFailed, hadErrorEvent: errors.length > 0, secondLive: track?.readyState, enabled: window.__valm.getState().camera.isEnabled }
  })

  expect(result.firstFailed).toBe(true)
  expect(result.hadErrorEvent).toBe(true)
  expect(result.secondLive).toBe('live') // восстановились
  expect(result.enabled).toBe(true)
})

test('screen-share: updateConstraints во время активного шаринга авто-перезапускает поток', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ss = window.__valm.screenShareController
    await ss.start()
    const firstId = ss.getTrack()?.id

    // меняем параметры на лету — по доке демонстрация должна перезапуститься
    ss.updateConstraints({ maxWidth: 1280, maxHeight: 720 })
    await new Promise((r) => setTimeout(r, 500))

    const secondId = ss.getTrack()?.id
    const state = { isActive: ss.state.isActive, live: ss.getTrack()?.readyState }
    ss.stop()
    return { firstId, secondId, state }
  })

  expect(result.state.isActive).toBe(true)
  expect(result.state.live).toBe('live')
  // авто-рестарт → новый трек
  expect(result.secondId).not.toBe(result.firstId)
})
