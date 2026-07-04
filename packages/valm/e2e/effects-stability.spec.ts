import { test, expect } from '@playwright/test'
import { gotoFixture, destroyValm } from './helpers/setup'

// Стабильность конвейера на длинном прогоне: currentFps держится и не коллапсирует,
// выходной трек не пересоздаётся, живые треки камеры не растут со временем.
// Лёгкий эффект без ML (passthrough) — держит высокий FPS и не зависит от MediaPipe.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  // учёт всех треков, созданных через getUserMedia
  await page.evaluate(() => {
    ;(window as any).__tracks = []
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c: MediaStreamConstraints) => {
      const s = await orig(c)
      s.getTracks().forEach((t) => (window as any).__tracks.push(t))
      return s
    }
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('длинный прогон эффекта: FPS стабилен, трек не пересоздаётся, треки не текут', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()

    // дешёвый passthrough-эффект без ML
    const { BaseEffect, EffectType } = window.Effects as any
    class Passthrough extends BaseEffect {
      name = 'passthrough'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      constructor() {
        super({})
      }
      apply(ctx: any) {
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }
    const c = window.__valm.effectsController
    await c.addEffect(new Passthrough())

    const outTrackIdStart = window.__valm.cameraController.getTrack()?.id
    const liveStart = (window as any).__tracks.filter((t: MediaStreamTrack) => t.readyState === 'live').length

    // прогрев + сбор FPS каждые ~1.2с в течение ~6с
    const fpsSamples: number[] = []
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1200))
      fpsSamples.push(c.state.currentFps)
    }

    const outTrackIdEnd = window.__valm.cameraController.getTrack()?.id
    const liveEnd = (window as any).__tracks.filter((t: MediaStreamTrack) => t.readyState === 'live').length
    const rawTracksTotal = (window as any).__tracks.length

    return {
      fpsSamples,
      outTrackIdStart,
      outTrackIdEnd,
      liveStart,
      liveEnd,
      rawTracksTotal,
      preset: c.getPerformanceConfig().preset,
      isRunning: c.state.isProcessingEnabled,
    }
  })

  // FPS: после прогрева стабильно ненулевой и не коллапсирует
  const warm = result.fpsSamples.slice(1) // отбрасываем первый (прогрев)
  for (const fps of warm) {
    expect(fps).toBeGreaterThan(5) // pipeline реально рендерит, без коллапса в 0
  }
  // последний замер тоже живой
  expect(result.fpsSamples[result.fpsSamples.length - 1]).toBeGreaterThan(5)

  // выходной трек не пересоздавался в течение прогона (insertable-streams — тот же генератор)
  expect(result.outTrackIdEnd).toBe(result.outTrackIdStart)

  // живые треки камеры не растут: как был один raw-трек, так и остался
  expect(result.liveStart).toBe(1)
  expect(result.liveEnd).toBe(1)
  expect(result.rawTracksTotal).toBe(1) // getUserMedia не дёргался повторно за прогон

  // на коротком прогоне adaptive-downgrade не сработал ложно
  expect(result.preset).toBe('medium')
  expect(result.isRunning).toBe(true)
})

test('добавление/снятие эффекта в цикле не копит живые треки', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    window.__valm.use(new window.Effects.EffectsPlugin())
    await window.__valm.cameraController.enable()

    const { BaseEffect, EffectType } = window.Effects as any
    const mk = () =>
      new (class extends BaseEffect {
        name = 'p'
        type = EffectType.COLOR_FILTER
        requiredFeatures: any[] = []
        constructor() {
          super({})
        }
        apply(ctx: any) {
          ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
        }
      })()

    const c = window.__valm.effectsController
    // 8 циклов add → remove
    for (let i = 0; i < 8; i++) {
      await c.addEffect(mk())
      c.removeEffect('p')
    }
    await new Promise((r) => setTimeout(r, 300))

    const live = (window as any).__tracks.filter((t: MediaStreamTrack) => t.readyState === 'live').length
    return { live, rawTotal: (window as any).__tracks.length, effects: c.getEffects().length }
  })

  // единственный raw-трек камеры, без накопления
  expect(result.rawTotal).toBe(1)
  expect(result.live).toBe(1)
  expect(result.effects).toBe(0) // все эффекты сняты
})
