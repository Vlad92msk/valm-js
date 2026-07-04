import { test, expect } from '@playwright/test'
import { gotoFixture, destroyValm } from './helpers/setup'

// Утечки ресурсов: треки, AudioContext, подписки. Инструментируем браузерные API
// ДО создания Valm, гоняем циклы и проверяем, что после destroy() ничего не течёт.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  // Обёртки над getUserMedia и AudioContext — собираем всё созданное.
  await page.evaluate(() => {
    ;(window as any).__tracks = []
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c: MediaStreamConstraints) => {
      const s = await origGUM(c)
      s.getTracks().forEach((t) => (window as any).__tracks.push(t))
      return s
    }
    ;(window as any).__contexts = []
    const OrigAC = window.AudioContext
    // @ts-expect-error — подменяем конструктор для учёта инстансов
    window.AudioContext = class extends OrigAC {
      constructor(...args: any[]) {
        super(...args)
        ;(window as any).__contexts.push(this)
      }
    }
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('циклы enable/disable камеры не копят живые треки, destroy() глушит все', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    const cam = window.__valm.cameraController
    // 5 честных (awaited) циклов
    for (let i = 0; i < 5; i++) {
      await cam.enable()
      cam.disable()
    }
    const tracks: MediaStreamTrack[] = (window as any).__tracks
    const liveAfterCycles = tracks.filter((t) => t.readyState === 'live').length

    // оставляем камеру включённой, затем destroy
    await cam.enable()
    const liveBeforeDestroy = tracks.filter((t) => t.readyState === 'live').length
    await window.__valm.destroy()
    const liveAfterDestroy = tracks.filter((t) => t.readyState === 'live').length

    window.__valm = undefined
    return { created: tracks.length, liveAfterCycles, liveBeforeDestroy, liveAfterDestroy }
  })

  // создали 6 треков (5 циклов + 1), но живым в конце каждого цикла оставаться не должно
  expect(result.created).toBeGreaterThanOrEqual(6)
  expect(result.liveAfterCycles).toBe(0) // awaited disable честно глушит
  expect(result.liveBeforeDestroy).toBe(1)
  expect(result.liveAfterDestroy).toBe(0) // destroy() заглушил всё
})

test('destroy() глушит и видео, и аудио треки', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: true } })
    await window.__valm.initialize()
    const tracks: MediaStreamTrack[] = (window as any).__tracks
    const liveBefore = tracks.filter((t) => t.readyState === 'live').length
    await window.__valm.destroy()
    const liveAfter = tracks.filter((t) => t.readyState === 'live').length
    const kinds = tracks.map((t) => `${t.kind}:${t.readyState}`)
    window.__valm = undefined
    return { liveBefore, liveAfter, kinds }
  })
  expect(result.liveBefore).toBeGreaterThanOrEqual(2) // хотя бы video + audio
  expect(result.liveAfter).toBe(0)
})

test('destroy() снимает подписки Valm (listenerCount → 0)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    window.__valm.on('videoStateChanged', () => {})
    window.__valm.on('error', () => {})
    const before = window.__valm.listenerCount('videoStateChanged') + window.__valm.listenerCount('error')
    await window.__valm.destroy()
    const after = window.__valm.listenerCount('videoStateChanged') + window.__valm.listenerCount('error')
    window.__valm = undefined
    return { before, after }
  })
  expect(result.before).toBeGreaterThan(0)
  expect(result.after).toBe(0) // removeAllListeners в destroy()
})

test('AudioContext, созданные под аудио, закрываются к моменту после destroy', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: true } })
    await window.__valm.initialize()
    // дать VAD/аудио-обработке создать контекст(ы)
    await new Promise((r) => setTimeout(r, 400))
    const contexts: AudioContext[] = (window as any).__contexts
    const createdCount = contexts.length
    await window.__valm.destroy()
    await new Promise((r) => setTimeout(r, 200))
    const openAfterDestroy = contexts.filter((c) => c.state !== 'closed').length
    window.__valm = undefined
    return { createdCount, openAfterDestroy, states: contexts.map((c) => c.state) }
  })

  // если аудио включалось — контекст создавался
  expect(result.createdCount).toBeGreaterThanOrEqual(1)
  // после destroy ни один не должен остаться открытым
  expect(result.openAfterDestroy).toBe(0)
})

test('повторный destroy() не бросает', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: false } })
    await window.__valm.initialize()
    await window.__valm.destroy()
    await window.__valm.destroy() // второй раз — не должно кидать
    window.__valm = undefined
    return true
  })
  expect(ok).toBe(true)
})
