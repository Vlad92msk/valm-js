import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'
import { countTracks } from './helpers/media'

// Стресс/гонки: то, чего нет в guide напрямую, но чем нагружается конкурентная
// логика abortController/pendingSwitch в track-менеджерах. Цель — поймать зависания,
// лишние живые треки и необработанные ошибки при быстрых переключениях.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  // собираем все error-события модуля за тест
  await page.evaluate(() => {
    window.__events = []
    window.__valm.on('error', (e: any) => window.__events.push(e))
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('10 последовательных toggle() камеры оставляют согласованное состояние', async ({ page }) => {
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) await window.__valm.cameraController.toggle()
  })
  // чётное число тоглов → камера выключена
  const state = await getState(page)
  expect(state.camera.isEnabled).toBe(false)
  // не осталось живого видео-трека
  expect(await countTracks(page, 'window.__valm.cameraController.getStream()', 'video')).toBeLessThanOrEqual(0)
  expect(await page.evaluate(() => window.__events.length)).toBe(0)
})

// РЕГРЕССИЯ (бывший дефект, закрыт): enable()/toggle() теперь funnel-ятся через ту же
// сериализацию abortController/pendingSwitch, что и switchDevice — конкурентные незавершённые
// вызовы отменяют предшественника, поэтому в стриме остаётся ≤1 живой трек, без ERROR-событий.
test('параллельный спам toggle() не должен плодить треки', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // 8 несинхронизированных вызовов
    const calls = Array.from({ length: 8 }, () => window.__valm.cameraController.toggle())
    await Promise.allSettled(calls)
    // дать осесть возможным отложенным операциям
    await new Promise((r) => setTimeout(r, 300))
    const stream = window.__valm.cameraController.getStream()
    return {
      videoTracks: stream ? stream.getVideoTracks().length : 0,
      liveVideoTracks: stream ? stream.getVideoTracks().filter((t) => t.readyState === 'live').length : 0,
    }
  })
  // в стриме не должно быть больше одного видео-трека
  expect(result.videoTracks).toBeLessThanOrEqual(1)
  expect(result.liveVideoTracks).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => window.__events.length)).toBe(0)
})

// РЕГРЕССИЯ (бывший дефект, закрыт): три конкурентных switchDevice оставляли 2 живых аудио-трека.
// Теперь сериализация отменяет проигравшие переключения — ровно 1 трек на последнем deviceId.
test('конкурентный switchDevice микрофона не должен оставлять лишние треки', async ({ page }) => {
  const mics = await page.evaluate(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices()
    return devs.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map((d) => d.deviceId)
  })
  test.skip(mics.length < 2, 'Нужны минимум 2 микрофона')

  await page.evaluate((id) => window.__valm.microphoneController.enable(id), mics[0])

  const result = await page.evaluate(async (ids) => {
    // Три конкурентных переключения без await между ними
    const calls = [
      window.__valm.microphoneController.switchDevice(ids[1]),
      window.__valm.microphoneController.switchDevice(ids[0]),
      window.__valm.microphoneController.switchDevice(ids[1]),
    ]
    await Promise.allSettled(calls)
    await new Promise((r) => setTimeout(r, 300))
    const stream = window.__valm.microphoneController.getStream()
    const audioTracks = stream ? stream.getAudioTracks() : []
    return {
      count: audioTracks.length,
      live: audioTracks.filter((t) => t.readyState === 'live').length,
      deviceId: window.__valm.microphoneController.getTrack()?.getSettings().deviceId,
    }
  }, mics)

  expect(result.count).toBe(1) // ровно один аудио-трек в стриме, старые не протекли
  expect(result.live).toBe(1)
  expect(result.deviceId).toBe(mics[1]) // выиграло последнее переключение
  expect(await page.evaluate(() => window.__events.length)).toBe(0)
})

// РЕГРЕССИЯ (бывший дефект, закрыт): interleaved enable/disable без await оставлял до 3 живых
// аудио-треков. Теперь disable() отменяет in-flight acquire, а enable() сериализуется → ≤1 трек.
test('interleaved enable/disable микрофона не должен оставлять мусора', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const mic = window.__valm.microphoneController
    // чередуем, не дожидаясь
    const ops = [mic.enable(), Promise.resolve(mic.disable()), mic.enable(), Promise.resolve(mic.disable()), mic.enable()]
    await Promise.allSettled(ops)
    await new Promise((r) => setTimeout(r, 300))
    const stream = mic.getStream()
    return {
      audioTracks: stream ? stream.getAudioTracks().length : 0,
      liveAudio: stream ? stream.getAudioTracks().filter((t) => t.readyState === 'live').length : 0,
      isEnabled: mic.state.isEnabled,
    }
  })
  // финальное состояние согласовано с наличием трека
  expect(result.audioTracks).toBeLessThanOrEqual(1)
  expect(result.liveAudio).toBeLessThanOrEqual(1)
  if (result.isEnabled) expect(result.liveAudio).toBe(1)
  else expect(result.liveAudio).toBe(0)
})

test('toggleFacing() несколько раз подряд флипает facingMode и не роняет трек', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const start = await page.evaluate(() => window.__valm.cameraController.getConfiguration().facingMode)

  await page.evaluate(async () => {
    await window.__valm.cameraController.toggleFacing()
    await window.__valm.cameraController.toggleFacing()
    await window.__valm.cameraController.toggleFacing()
  })

  const cfg = await page.evaluate(() => window.__valm.cameraController.getConfiguration())
  // нечётное число флипов → противоположный facingMode
  expect(cfg.facingMode).toBe(start === 'user' ? 'environment' : 'user')
  // deviceId сброшен в null (переключение по facingMode)
  expect(cfg.deviceId).toBeNull()
  // трек жив
  const live = await page.evaluate(() => window.__valm.cameraController.getTrack()?.readyState)
  expect(live).toBe('live')
  expect(await page.evaluate(() => window.__events.length)).toBe(0)
})
