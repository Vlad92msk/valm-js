import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Плагин valm-js/audio-effects: подключение ML-провайдера в аудио-граф микрофона.
// Вместо реального RNNoise используем лёгкий провайдер, отдающий GainNode как
// «ML-узел» — проверяем контракт вставки узла и активации графа.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('use(AudioEffectsPlugin) с noiseSuppression включает обработку микрофона', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  const rawId = await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id)

  await page.evaluate(() => {
    const provider = { createNode: (ctx: AudioContext) => ctx.createGain() }
    const plugin = new window.AudioEffects.AudioEffectsPlugin({ providers: { noiseSuppression: provider } })
    window.__valm.use(plugin)
  })

  // граф активирован плагином → публикуемый трек стал обработанным
  await expect
    .poll(async () => page.evaluate(() => window.__valm.microphoneController.getTrack()?.id))
    .not.toBe(rawId)

  const running = await page.evaluate(() => window.__valm.mediaStreamService.getAudioProcessingPipeline().isRunning())
  expect(running).toBe(true)
})

test('плагин без провайдеров не трогает публикуемый трек', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  const rawId = await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id)

  await page.evaluate(() => {
    const plugin = new window.AudioEffects.AudioEffectsPlugin()
    window.__valm.use(plugin)
  })

  // никакой обработки не запрошено — выход остаётся сырым треком
  const outId = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)
  expect(outId).toBe(rawId)
  expect(await page.evaluate(() => window.__valm.mediaStreamService.getAudioProcessingPipeline().isRunning())).toBe(false)
})

test('RNNoiseProvider без workletUrl бросает понятную ошибку при создании узла', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const provider = new window.AudioEffects.RNNoiseProvider()
    const ctx = new AudioContext()
    try {
      await provider.createNode(ctx)
      return ''
    } catch (e: any) {
      return e.message
    } finally {
      ctx.close()
    }
  })

  expect(message).toContain('workletUrl')
})

test('gain остаётся управляемым при активном ML-провайдере', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => {
    const provider = { createNode: (ctx: AudioContext) => ctx.createGain() }
    window.__valm.use(new window.AudioEffects.AudioEffectsPlugin({ providers: { noiseSuppression: provider } }))
  })

  await page.evaluate(() => window.__valm.microphoneController.setGain(3))
  expect(await page.evaluate(() => window.__valm.microphoneController.getGain())).toBe(3)
})
