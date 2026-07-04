import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Конвейер эффектов: порядок применения и ping-pong (надёжный тест без ML) + доступ
// кастомных эффектов к ML-результатам (ctx.segmentationMask, ctx.faceMesh). ML-части
// ТЯЖЁЛЫЕ (MediaPipe WASM) и гейтятся skip, если провайдер не поднялся в среде.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => window.__valm.use(new window.Effects.EffectsPlugin()))
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

// Прочитать RGB центра левой и правой половин обработанного кадра камеры.
async function readHalves(page: Page): Promise<{ left: number[]; right: number[]; vw: number }> {
  return page.evaluate(async () => {
    const track = window.__valm.cameraController.getTrack()!
    const video = document.getElementById('video') as HTMLVideoElement
    video.srcObject = new MediaStream([track])
    await video.play().catch(() => {})
    await new Promise((r) => setTimeout(r, 800))

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 240
    const c2d = canvas.getContext('2d')!
    c2d.drawImage(video, 0, 0, canvas.width, canvas.height)
    const q = canvas.width >> 2
    const mid = canvas.height >> 1
    const left = Array.from(c2d.getImageData(q, mid, 1, 1).data).slice(0, 3)
    const right = Array.from(c2d.getImageData(q * 3, mid, 1, 1).data).slice(0, 3)
    return { left, right, vw: video.videoWidth }
  })
}

test('цепочка из двух кастомных эффектов: порядок и ping-pong (второй видит выход первого)', async ({ page }) => {
  await page.evaluate(async () => {
    const { BaseEffect, EffectType } = window.Effects as any

    // Эффект: копирует source (выход предыдущего), затем заливает область цветом.
    class Fill extends BaseEffect {
      name: string
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      color: string
      side: 'all' | 'left'
      constructor(name: string, color: string, side: 'all' | 'left') {
        super({})
        this.name = name
        this.color = color
        this.side = side
      }
      apply(ctx: any) {
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
        ctx.outputCtx.fillStyle = this.color
        if (this.side === 'all') ctx.outputCtx.fillRect(0, 0, ctx.width, ctx.height)
        else ctx.outputCtx.fillRect(0, 0, ctx.width / 2, ctx.height)
      }
    }

    await window.__valm.cameraController.enable()
    // порядок: сначала весь красный, потом левую половину зелёным
    await window.__valm.effectsController.addEffect(new Fill('e1-red-all', 'rgb(255,0,0)', 'all'))
    await window.__valm.effectsController.addEffect(new Fill('e2-green-left', 'rgb(0,255,0)', 'left'))
  })

  const { left, right, vw } = await readHalves(page)
  expect(vw).toBeGreaterThan(0)
  // левая половина зелёная (эффект2), правая осталась красной (эффект1 → через source эффекта2)
  expect(left[1]).toBeGreaterThan(180) // G высокий
  expect(left[0]).toBeLessThan(90) // R низкий
  expect(right[0]).toBeGreaterThan(180) // R высокий — проходит через ping-pong от эффекта1
  expect(right[1]).toBeLessThan(90) // G низкий
})

test('порядок применения обратный меняет результат (подтверждает, что порядок важен)', async ({ page }) => {
  await page.evaluate(async () => {
    const { BaseEffect, EffectType } = window.Effects as any
    class Fill extends BaseEffect {
      name: string
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = []
      color: string
      side: 'all' | 'left'
      constructor(name: string, color: string, side: 'all' | 'left') {
        super({})
        this.name = name
        this.color = color
        this.side = side
      }
      apply(ctx: any) {
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
        ctx.outputCtx.fillStyle = this.color
        if (this.side === 'all') ctx.outputCtx.fillRect(0, 0, ctx.width, ctx.height)
        else ctx.outputCtx.fillRect(0, 0, ctx.width / 2, ctx.height)
      }
    }
    await window.__valm.cameraController.enable()
    // ОБРАТНЫЙ порядок: сначала левый зелёный, потом весь красный → красный затирает всё
    await window.__valm.effectsController.addEffect(new Fill('e1-green-left', 'rgb(0,255,0)', 'left'))
    await window.__valm.effectsController.addEffect(new Fill('e2-red-all', 'rgb(255,0,0)', 'all'))
  })

  const { left, right } = await readHalves(page)
  // последний эффект (красный на весь кадр) победил в обеих половинах
  expect(left[0]).toBeGreaterThan(180)
  expect(left[1]).toBeLessThan(90)
  expect(right[0]).toBeGreaterThan(180)
})

test('кастомный эффект с requiredFeatures:[SEGMENTATION] получает ctx.segmentationMask', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { BaseEffect, EffectType, EffectFeature } = window.Effects as any
    ;(window as any).__seen = { calls: 0, hasMask: false, maskLen: 0, isU8: false }

    class Probe extends BaseEffect {
      name = 'seg-probe'
      type = EffectType.COLOR_FILTER
      requiredFeatures = [EffectFeature.SEGMENTATION]
      constructor() {
        super({})
      }
      apply(ctx: any) {
        const seen = (window as any).__seen
        seen.calls++
        if (ctx.segmentationMask) {
          seen.hasMask = true
          seen.maskLen = ctx.segmentationMask.length
          seen.isU8 = ctx.segmentationMask instanceof Uint8Array
        }
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }

    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.addEffect(new Probe())
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
  test.skip(!result.ok, `MediaPipe segmentation не поднялся: ${result.error}`)

  // ждём, пока эффект получит маску от сегментации
  await expect
    .poll(async () => page.evaluate(() => (window as any).__seen.hasMask), { timeout: 20_000 })
    .toBe(true)

  const seen = await page.evaluate(() => (window as any).__seen)
  expect(seen.calls).toBeGreaterThan(0)
  expect(seen.isU8).toBe(true) // маска — Uint8Array
  expect(seen.maskLen).toBeGreaterThan(0) // непустая, размером с кадр
})

test('сегментация переинициализируется после stopProcessing (провайдер не теряется)', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const { BaseEffect, EffectType, EffectFeature } = window.Effects as any
    ;(window as any).__rm = { first: false, second: false }
    ;(window as any).__mkSeg = (slot: 'first' | 'second') =>
      new (class extends BaseEffect {
        name = 'seg-' + slot
        type = EffectType.COLOR_FILTER
        requiredFeatures = [EffectFeature.SEGMENTATION]
        constructor() {
          super({})
        }
        apply(ctx: any) {
          if (ctx.segmentationMask) (window as any).__rm[slot] = true
          ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
        }
      })()

    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.addEffect((window as any).__mkSeg('first'))
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
  test.skip(!first.ok, `MediaPipe segmentation не поднялся: ${first.error}`)

  // маска дошла в первый раз
  await expect.poll(async () => page.evaluate(() => (window as any).__rm.first), { timeout: 20_000 }).toBe(true)

  // полностью останавливаем обработку (удаляет эффекты + disposeUnused провайдера) и включаем заново
  await page.evaluate(async () => {
    window.__valm.effectsController.stopProcessing()
    await window.__valm.effectsController.addEffect((window as any).__mkSeg('second'))
  })

  // после повторного включения сегментация снова доставляет маску (регрессия disposeUnused)
  await expect.poll(async () => page.evaluate(() => (window as any).__rm.second), { timeout: 20_000 }).toBe(true)
})

test('встроенный enableBlur() реально запускает сегментацию (дефолтный провайдер зарегистрирован)', async ({ page }) => {
  // Регрессия: раньше EffectsPlugin не регистрировал встроенные MediaPipe-провайдеры,
  // и blur молча уходил в fallback (без размытия фона). Probe-эффект без requiredFeatures
  // получает маску, только если её посчитал pipeline — а он считает её из-за blur.
  const enabled = await page.evaluate(async () => {
    const { BaseEffect, EffectType } = window.Effects as any
    ;(window as any).__blurMask = false
    class Probe extends BaseEffect {
      name = 'mask-probe'
      type = EffectType.COLOR_FILTER
      requiredFeatures: any[] = [] // сам ничего не требует — маску приносит blur
      constructor() {
        super({})
      }
      apply(ctx: any) {
        if (ctx.segmentationMask) (window as any).__blurMask = true
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }
    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.enableBlur()
      await window.__valm.effectsController.addEffect(new Probe())
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
  test.skip(!enabled.ok, `MediaPipe blur не поднялся: ${enabled.error}`)

  await expect.poll(async () => page.evaluate(() => (window as any).__blurMask), { timeout: 20_000 }).toBe(true)
})

test('FaceMesh: у безликой фейковой камеры ctx.faceMesh.landmarks === null (graceful)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { BaseEffect, EffectType, EffectFeature } = window.Effects as any
    ;(window as any).__fm = { calls: 0, gotContextWithFaceMesh: false, landmarks: 'unset' }

    class FaceProbe extends BaseEffect {
      name = 'face-probe'
      type = EffectType.COLOR_FILTER
      requiredFeatures = [EffectFeature.FACE_MESH]
      constructor() {
        super({})
      }
      apply(ctx: any) {
        const fm = (window as any).__fm
        fm.calls++
        if (ctx.faceMesh) {
          fm.gotContextWithFaceMesh = true
          fm.landmarks = ctx.faceMesh.landmarks // null для безликого кадра
        }
        ctx.outputCtx.drawImage(ctx.sourceCanvas, 0, 0)
      }
    }

    await window.__valm.cameraController.enable()
    try {
      await window.__valm.effectsController.addEffect(new FaceProbe())
      return { ok: true, error: '' }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  })
  test.skip(!result.ok, `MediaPipe faceMesh не поднялся: ${result.error}`)

  // ждём, пока faceMesh-результат долетит до эффекта
  await expect
    .poll(async () => page.evaluate(() => (window as any).__fm.gotContextWithFaceMesh), { timeout: 20_000 })
    .toBe(true)

  const fm = await page.evaluate(() => (window as any).__fm)
  // лица нет → landmarks null, но контекст доставлен и pipeline не упал
  expect(fm.landmarks).toBeNull()
  expect(fm.calls).toBeGreaterThan(0)
})
