import { test, expect } from '@playwright/test'
import { gotoFixture, destroyValm } from './helpers/setup'

// Жизненный цикл инстанса: машина состояний initializeMedia (subscribe/getSnapshot),
// autoInitialize, graceful-поведение вызовов после destroy() и destroy() во время
// активной записи/шаринга. Цель — поймать краши и утечки на границах жизненного цикла.

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('initializeMedia() проходит idle → initializing → ready', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: false } })
    const states: string[] = []
    // фиксируем начальный снимок и каждое уведомление
    states.push(window.__valm.getSnapshot().initializationState)
    window.__valm.subscribe(() => states.push(window.__valm.getSnapshot().initializationState))
    await window.__valm.initializeMedia()
    return { states, final: window.__valm.getSnapshot() }
  })

  expect(result.states[0]).toBe('idle')
  expect(result.states).toContain('initializing')
  expect(result.states[result.states.length - 1]).toBe('ready')
  expect(result.final.initializationState).toBe('ready')
  expect(result.final.error).toBeNull()
})

test('initializeMedia() при провале getUserMedia уходит в error и пробрасывает', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    // Ломаем getUserMedia — эмуляция отказа устройства
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError')
    }
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: false } })
    const states: string[] = []
    window.__valm.subscribe(() => states.push(window.__valm.getSnapshot().initializationState))

    let threw = false
    try {
      await window.__valm.initializeMedia()
    } catch {
      threw = true
    }
    return { states, threw, snap: window.__valm.getSnapshot() }
  })

  expect(result.threw).toBe(true) // ошибка проброшена наружу
  expect(result.states).toContain('initializing')
  expect(result.snap.initializationState).toBe('error')
  expect(result.snap.error).not.toBeNull() // error заполнен для UI
})

test('autoInitialize:true в конструкторе поднимает медиа без явного initialize()', async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => {
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: false }, autoInitialize: true })
  })
  // конструктор запускает initialize() асинхронно — ждём появления живого видео-трека
  await expect
    .poll(async () => page.evaluate(() => window.__valm.cameraController.getTrack()?.readyState ?? 'none'))
    .toBe('live')
})

test('вызовы API после destroy() не крашат страницу', async ({ page }) => {
  await gotoFixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: true } })
    await window.__valm.initialize()
    await window.__valm.destroy()

    // Набор вызовов после уничтожения — каждый должен либо no-op, либо отклониться,
    // но НЕ бросать синхронно и не ронять страницу.
    const outcomes: Record<string, string> = {}
    const tryCall = async (name: string, fn: () => any) => {
      try {
        await fn()
        outcomes[name] = 'ok'
      } catch (e) {
        outcomes[name] = 'rejected'
      }
    }
    await tryCall('camera.enable', () => window.__valm.cameraController.enable())
    await tryCall('camera.disable', () => window.__valm.cameraController.disable())
    await tryCall('mic.toggle', () => window.__valm.microphoneController.toggle())
    await tryCall('getState', () => window.__valm.getState())
    await tryCall('getConfiguration', () => window.__valm.getConfiguration())
    await tryCall('screen.stop', () => window.__valm.screenShareController.stop())

    window.__valm = undefined
    return outcomes
  })

  // Ни один вызов не должен уронить страницу необработанным исключением
  expect(pageErrors).toEqual([])
  // getState/getConfiguration должны оставаться безопасными геттерами
  expect(result.getState).toBe('ok')
  expect(result.getConfiguration).toBe('ok')
})

test('destroy() во время активной записи останавливает всё без живых треков', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    ;(window as any).__tracks = []
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (c: MediaStreamConstraints) => {
      const s = await origGUM(c)
      s.getTracks().forEach((t) => (window as any).__tracks.push(t))
      return s
    }

    window.__valm = new window.Valm.Valm({ video: { enabled: true }, audio: { enabled: true } })
    await window.__valm.initialize()
    await window.__valm.recordingController.startRecording()
    // дать записи реально стартовать
    await new Promise((r) => setTimeout(r, 300))
    const recordingBefore = window.__valm.recordingController.state.isRecording

    // destroy во время активной записи — не должен кинуть
    let threw = false
    try {
      await window.__valm.destroy()
    } catch {
      threw = true
    }
    await new Promise((r) => setTimeout(r, 200))

    const tracks: MediaStreamTrack[] = (window as any).__tracks
    const liveAfter = tracks.filter((t) => t.readyState === 'live').length
    window.__valm = undefined
    return { recordingBefore, threw, liveAfter, created: tracks.length }
  })

  expect(result.recordingBefore).toBe(true) // запись реально шла
  expect(result.threw).toBe(false) // destroy во время записи не бросает
  expect(result.created).toBeGreaterThanOrEqual(2)
  expect(result.liveAfter).toBe(0) // все треки заглушены
})

test('destroy() во время активного screen-share останавливает display-трек', async ({ page }) => {
  await gotoFixture(page)
  const result = await page.evaluate(async () => {
    window.__valm = new window.Valm.Valm({ video: { enabled: false }, audio: { enabled: false } })
    await window.__valm.screenShareController.start()
    const displayTrack = window.__valm.screenShareController.getStream()?.getVideoTracks()[0] ?? null
    const liveBefore = displayTrack?.readyState

    let threw = false
    try {
      await window.__valm.destroy()
    } catch {
      threw = true
    }
    const liveAfter = displayTrack?.readyState
    window.__valm = undefined
    return { liveBefore, liveAfter, threw }
  })

  expect(result.liveBefore).toBe('live')
  expect(result.threw).toBe(false)
  expect(result.liveAfter).toBe('ended') // display-трек заглушён при destroy
})
