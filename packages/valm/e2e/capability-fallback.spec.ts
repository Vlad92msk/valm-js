import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, newInitializedValm, destroyValm } from './helpers/setup'

// Деградация под ограничения браузера/движка. Мы не можем поднять реальный iOS WebKit
// в headless Chromium, но можем СМОДЕЛИРОВАТЬ отсутствие фич (Insertable Streams, кодеки,
// setSinkId, getDisplayMedia) и спуфнуть тип устройства — и проверить, что библиотека
// корректно ветвится/деградирует. Это ловит класс «работает в одном браузере, не в другом».

test.describe.configure({ timeout: 60_000 })

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('baseline: desktop Chromium использует insertable-streams процессор', async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  const type = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
    await window.__valm.effectsController.enableBlur().catch(() => {})
    return window.__valm.effectsController.getPipelineState()?.processorType
  })
  expect(type).toBe('insertable-streams')
})

test('нет Insertable Streams (Safari/iOS/Firefox) → pipeline падает в canvas, эффект работает', async ({ page }) => {
  await gotoFixture(page)
  // убираем Insertable Streams API ДО создания pipeline
  await page.evaluate(() => {
    ;(window as any).MediaStreamTrackProcessor = undefined
    ;(window as any).MediaStreamTrackGenerator = undefined
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })

  const result = await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()

    // кастомный эффект без ML — заливает красным
    const { BaseEffect, EffectType } = window.Effects as any
    class Red extends BaseEffect {
      name = 'red'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        ctx.outputCtx.fillStyle = 'rgb(255,0,0)'
        ctx.outputCtx.fillRect(0, 0, ctx.width, ctx.height)
      }
    }
    await window.__valm.effectsController.addEffect(new Red())

    const track = window.__valm.cameraController.getTrack()!
    const video = document.getElementById('video') as HTMLVideoElement
    video.srcObject = new MediaStream([track])
    await video.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 700))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const c2d = canvas.getContext('2d')!
    c2d.drawImage(video, 0, 0, canvas.width, canvas.height)
    const [r, g, b] = Array.from(c2d.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data)

    return {
      processorType: window.__valm.effectsController.getPipelineState()?.processorType,
      vw: video.videoWidth,
      r, g, b,
    }
  })

  expect(result.processorType).toBe('canvas') // деградация на canvas-процессор
  expect(result.vw).toBeGreaterThan(0) // выход есть
  expect(result.r).toBeGreaterThan(200) // эффект применился и через canvas
  expect(result.g).toBeLessThan(80)
})

test('спуф mobile/iOS UA → DeviceDetector и pipeline выбирают canvas (Insertable Streams запрещён)', async ({ page }) => {
  await gotoFixture(page)
  // спуфим userAgent под iPhone ДО инициализации
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    })
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })

  const result = await page.evaluate(async () => {
    const D = window.Valm.DeviceDetector
    const detected = { isMobile: D.isMobile(), isIOS: D.isIOS(), isSafari: D.isSafari(), isDesktop: D.isDesktop() }

    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()
    const processorType = window.__valm.effectsController.getPipelineState()?.processorType
    return { detected, processorType }
  })

  // библиотека распознала мобильный iOS
  expect(result.detected.isMobile).toBe(true)
  expect(result.detected.isIOS).toBe(true)
  expect(result.detected.isDesktop).toBe(false)
  // и, несмотря на наличие Insertable Streams в Chromium, использует canvas (политика для mobile/Safari)
  expect(result.processorType).toBe('canvas')
})

test('MediaRecorder без vp9 (как в части браузеров) → запись падает на поддерживаемый кодек', async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => {
    const orig = MediaRecorder.isTypeSupported.bind(MediaRecorder)
    // эмулируем браузер без vp9
    MediaRecorder.isTypeSupported = (t: string) => (/vp9/i.test(t) ? false : orig(t))
  })
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    await rec.startRecording({ format: 'webm' })
    await new Promise((r) => setTimeout(r, 500))
    const blob = await rec.stopRecording()
    return { type: blob.type, size: blob.size }
  })

  expect(result.size).toBeGreaterThan(0) // запись прошла
  expect(result.type).not.toMatch(/vp9/i) // vp9 не выбран
  expect(result.type).toMatch(/webm|vp8/i) // выбран поддерживаемый fallback
})

test('нет setSinkId (Safari/iOS/Firefox) → isOutputSelectionSupported=false, setOutputDevice graceful', async ({ page }) => {
  await gotoFixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.evaluate(() => {
    // прячем setSinkId на прототипе, который читает isOutputSelectionSupported
    Object.defineProperty(HTMLAudioElement.prototype, 'setSinkId', { value: undefined, configurable: true })
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })

  const result = await page.evaluate(async () => {
    const ao = window.__valm.audioOutputController
    const supported = ao.isOutputSelectionSupported()
    let threw = false
    try {
      ao.setAvailableDevices(await navigator.mediaDevices.enumerateDevices())
      await ao.setOutputDevice('default')
    } catch {
      threw = true
    }
    return { supported, threw, deviceId: ao.getOutputState().deviceId }
  })

  expect(result.supported).toBe(false) // выбор выхода не поддержан
  expect(result.threw).toBe(false) // но вызовы не падают
  expect(result.deviceId).toBe('default')
  expect(pageErrors).toEqual([])
})

test('нет getDisplayMedia (iOS Safari) → checkCapabilities supported:false, start() reject gracefully', async ({ page }) => {
  await gotoFixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined, configurable: true })
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })

  const result = await page.evaluate(async () => {
    const caps = await (window.__valm.screenShareController.constructor as any).checkCapabilities()
    let started = true
    try {
      await window.__valm.screenShareController.start()
    } catch {
      started = false
    }
    return { supported: caps.supported, started, isActive: window.__valm.screenShareController.state.isActive }
  })

  expect(result.supported).toBe(false) // screen share не поддержан
  expect(result.started).toBe(false) // start() корректно отклонён
  expect(result.isActive).toBe(false)
  expect(pageErrors).toEqual([])
})
