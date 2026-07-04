import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// reorderEffects(): порядок применения эффектов. Экспонирован на EffectsController
// (раньше был только на pipeline, недоступен пользователю). Лёгкий сьют без ML —
// кастомные color-эффекты, пиксельная проверка эффективного порядка.

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(async () => {
    window.__valm.use(new window.Effects.EffectsPlugin())
    const { BaseEffect, EffectType } = window.Effects as any
    // Fill: копирует source (выход предыдущего) и заливает область цветом.
    ;(window as any).__Fill = class extends BaseEffect {
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
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

async function readHalves(page: Page): Promise<{ left: number[]; right: number[] }> {
  return page.evaluate(async () => {
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
    const q = canvas.width >> 2
    const mid = canvas.height >> 1
    const left = Array.from(c2d.getImageData(q, mid, 1, 1).data).slice(0, 3)
    const right = Array.from(c2d.getImageData(q * 3, mid, 1, 1).data).slice(0, 3)
    return { left, right }
  })
}

test('reorderEffects() меняет эффективный порядок цепочки (пиксели)', async ({ page }) => {
  await page.evaluate(async () => {
    const Fill = (window as any).__Fill
    const c = window.__valm.effectsController
    // порядок: красный на весь → зелёный слева. Итог: слева зелёный, справа красный.
    await c.addEffect(new Fill('red-all', 'rgb(255,0,0)', 'all'))
    await c.addEffect(new Fill('green-left', 'rgb(0,255,0)', 'left'))
  })

  let px = await readHalves(page)
  expect(px.left[1]).toBeGreaterThan(180) // слева зелёный
  expect(px.right[0]).toBeGreaterThan(180) // справа красный

  // меняем порядок: теперь зелёный-слева первый, красный-на-весь последний → весь красный
  await page.evaluate(() => window.__valm.effectsController.reorderEffects(['green-left', 'red-all']))

  px = await readHalves(page)
  expect(px.left[0]).toBeGreaterThan(180) // слева стал красный
  expect(px.right[0]).toBeGreaterThan(180) // справа красный
  expect(px.left[1]).toBeLessThan(100) // зелёного больше нет
})

test('reorderEffects() обновляет порядок getEffects()', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const Fill = (window as any).__Fill
    const c = window.__valm.effectsController
    await c.addEffect(new Fill('a', 'rgb(1,0,0)', 'all'))
    await c.addEffect(new Fill('b', 'rgb(0,1,0)', 'all'))
    await c.addEffect(new Fill('c', 'rgb(0,0,1)', 'all'))
    const before = c.getEffects().map((e: any) => e.name)
    c.reorderEffects(['c', 'a', 'b'])
    const after = c.getEffects().map((e: any) => e.name)
    return { before, after }
  })
  expect(result.before).toEqual(['a', 'b', 'c'])
  expect(result.after).toEqual(['c', 'a', 'b'])
})

test('reorderEffects() с частичным порядком дописывает недостающие в конец', async ({ page }) => {
  const after = await page.evaluate(async () => {
    const Fill = (window as any).__Fill
    const c = window.__valm.effectsController
    await c.addEffect(new Fill('a', 'rgb(1,0,0)', 'all'))
    await c.addEffect(new Fill('b', 'rgb(0,1,0)', 'all'))
    await c.addEffect(new Fill('c', 'rgb(0,0,1)', 'all'))
    // указываем только 'c' — остальные должны сохранить исходный порядок в конце
    c.reorderEffects(['c'])
    return c.getEffects().map((e: any) => e.name)
  })
  expect(after).toEqual(['c', 'a', 'b'])
})
