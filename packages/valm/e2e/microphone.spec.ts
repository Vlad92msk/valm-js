import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'
import { inspectTrack } from './helpers/media'

// Контракты из guides/microphone.md.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('enable() поднимает живой аудио-трек, disable() его останавливает', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  let track = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')
  expect(track.exists).toBe(true)
  expect(track.kind).toBe('audio')
  expect(track.readyState).toBe('live')
  expect((await getState(page)).microphone.isEnabled).toBe(true)

  await page.evaluate(() => window.__valm.microphoneController.disable())
  track = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')
  expect(track.exists).toBe(false)
  expect((await getState(page)).microphone.isEnabled).toBe(false)
})

test('toggleMute() — мягкий mute: трек жив (readyState=live), но track.enabled=false', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  let track = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')
  expect(track.exists).toBe(true)
  expect(track.readyState).toBe('live') // трек НЕ остановлен
  expect(track.enabled).toBe(false) // но заглушён
  expect((await getState(page)).microphone.isMuted).toBe(true)
  expect((await getState(page)).microphone.isEnabled).toBe(true) // всё ещё включён

  // unmute возвращает звук
  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  track = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')
  expect(track.readyState).toBe('live')
  expect(track.enabled).toBe(true)
  expect((await getState(page)).microphone.isMuted).toBe(false)
})

test('switchDevice() на другой микрофон заменяет трек и шлёт onTrackReplaced', async ({ page }) => {
  const mics = await page.evaluate(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices()
    return devs.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map((d) => d.deviceId)
  })
  test.skip(mics.length < 2, 'Нужны минимум 2 микрофона')

  await page.evaluate((id) => window.__valm.microphoneController.enable(id), mics[0])
  const beforeId = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)

  await page.evaluate(() => {
    window.__events = []
    window.__valm.microphoneController.onTrackReplaced((e: any) =>
      window.__events.push({ hasOld: !!e.oldTrack, hasNew: !!e.newTrack, newKind: e.newTrack?.kind }),
    )
  })

  await page.evaluate((id) => window.__valm.microphoneController.switchDevice(id), mics[1])

  await expect.poll(async () => (await page.evaluate(() => window.__events)).length).toBeGreaterThan(0)
  const events = await page.evaluate(() => window.__events)
  expect(events[0]).toEqual({ hasOld: true, hasNew: true, newKind: 'audio' })

  const afterId = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)
  expect(afterId).not.toBe(beforeId)
  expect((await getState(page)).microphone.deviceId).toBe(mics[1])
})

test('onStateChange шлёт MicrophoneState с полями isMuted/isEnabled', async ({ page }) => {
  await page.evaluate(() => {
    window.__events = []
    window.__valm.microphoneController.onStateChange((s: any) => window.__events.push(s))
  })
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__valm.microphoneController.toggleMute())

  const events = await page.evaluate(() => window.__events)
  expect(events.length).toBeGreaterThan(0)
  expect(events[0]).toHaveProperty('isMuted')
  expect(events[0]).toHaveProperty('isEnabled')
  expect(events[0]).toHaveProperty('volume')
  expect(events[0]).toHaveProperty('isSpeaking')
  expect(events.some((s: any) => s.isMuted === true)).toBe(true)
})

test('onVolumeChange получает уровень громкости с фейкового аудио-тона', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => {
    window.__events = []
    window.__valm.microphoneController.onVolumeChange((d: any) => window.__events.push(d))
  })

  // фейковый микрофон отдаёт тон → детектор громкости должен что-то прислать
  await expect.poll(async () => (await page.evaluate(() => window.__events)).length, { timeout: 8000 }).toBeGreaterThan(0)
  const events = await page.evaluate(() => window.__events)
  expect(events[0]).toHaveProperty('volume')
  expect(events[0]).toHaveProperty('isSpeaking')
  expect(typeof events[0].volume).toBe('number')
})

test('updateVolumeThreshold() пишет порог в конфигурацию', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.updateVolumeThreshold(42))
  const threshold = await page.evaluate(() => window.__valm.microphoneController.getConfiguration().volumeThreshold)
  expect(threshold).toBe(42)
})

test('preview() создаёт отдельный аудио-трек, publishPreview() публикует его', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  const previewId = await page.evaluate(async () => {
    const t = await window.__valm.microphoneController.preview()
    ;(window as any).__preview = t
    return t.id
  })
  expect((await getState(page)).microphone.isPreviewing).toBe(true)
  const previewInfo = await inspectTrack(page, '(window).__preview')
  expect(previewInfo.kind).toBe('audio')
  expect(previewInfo.readyState).toBe('live')

  await page.evaluate(() => window.__valm.microphoneController.publishPreview())
  const mainId = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)
  expect(mainId).toBe(previewId)
  expect((await getState(page)).microphone.isPreviewing).toBe(false)
})
