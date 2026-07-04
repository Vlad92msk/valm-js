import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'
import { inspectTrack, countTracks } from './helpers/media'

// Контракт из guides/getting-started.md:
//   new Valm({ video, audio }) + initialize() поднимает video/audio трек;
//   cameraController.getStream() возвращает живой MediaStream с активными треками нужного kind.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('фикстура выкладывает публичный API в window', async ({ page }) => {
  const api = await page.evaluate(() => ({
    hasValm: typeof window.Valm?.Valm === 'function',
    hasEffectsPlugin: typeof window.Effects?.EffectsPlugin === 'function',
    hasIsIOS: typeof window.Valm?.isIOS === 'function',
  }))
  expect(api).toEqual({ hasValm: true, hasEffectsPlugin: true, hasIsIOS: true })
})

test('new Valm() + initialize() поднимает живые video и audio треки', async ({ page }) => {
  await newValm(page, { video: { enabled: true }, audio: { enabled: true } })
  await page.evaluate(() => window.__valm.initialize())

  const video = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  const audio = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')

  expect(video.exists).toBe(true)
  expect(video.kind).toBe('video')
  expect(video.readyState).toBe('live')

  expect(audio.exists).toBe(true)
  expect(audio.kind).toBe('audio')
  expect(audio.readyState).toBe('live')
})

test('getStream() возвращает MediaStream с активным видео-треком', async ({ page }) => {
  await newValm(page, { video: { enabled: true }, audio: { enabled: false } })
  await page.evaluate(() => window.__valm.initialize())

  const videoCount = await countTracks(page, 'window.__valm.cameraController.getStream()', 'video')
  expect(videoCount).toBeGreaterThanOrEqual(1)

  const state = await getState(page)
  expect(state.camera.isEnabled).toBe(true)
})

test('audio: { enabled: false } не поднимает микрофон', async ({ page }) => {
  await newValm(page, { video: { enabled: true }, audio: { enabled: false } })
  await page.evaluate(() => window.__valm.initialize())

  const audio = await inspectTrack(page, 'window.__valm.microphoneController.getTrack()')
  expect(audio.exists).toBe(false)

  const state = await getState(page)
  expect(state.microphone.isEnabled).toBe(false)
})
