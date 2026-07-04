import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Контракты из guides/configuration.md.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page) // конфиг по умолчанию
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('дефолты применяются к секциям конфигурации', async ({ page }) => {
  const cfg = await page.evaluate(() => window.__valm.configurationController.getConfig())

  expect(cfg.video.resolution).toEqual({ width: 1280, height: 720 })
  expect(cfg.video.frameRate).toBe(30)
  expect(cfg.video.facingMode).toBe('user')

  expect(cfg.audio.echoCancellation).toBe(true)
  expect(cfg.audio.noiseSuppression).toBe(true)
  expect(cfg.audio.volumeThreshold).toBe(10)

  expect(cfg.recording.format).toBe('webm')
  expect(cfg.recording.quality).toBe('medium')

  // секции присутствуют целиком
  expect(Object.keys(cfg).sort()).toEqual(['audio', 'recording', 'screenShare', 'transcription', 'video'])
})

test('setVideoResolution / setVideoFrameRate меняют конфиг', async ({ page }) => {
  await page.evaluate(() => {
    window.__valm.configurationController.setVideoResolution(1920, 1080)
    window.__valm.configurationController.setVideoFrameRate(60)
  })
  const video = await page.evaluate(() => window.__valm.configurationController.getVideoConfig())
  expect(video.resolution).toEqual({ width: 1920, height: 1080 })
  expect(video.frameRate).toBe(60)
})

test('updateRecordingConfig меняет конфиг записи', async ({ page }) => {
  await page.evaluate(() =>
    window.__valm.configurationController.updateRecordingConfig({ format: 'mp4', quality: 'high', videoBitsPerSecond: 5_000_000 }),
  )
  const rec = await page.evaluate(() => window.__valm.configurationController.getRecordingConfig())
  expect(rec.format).toBe('mp4')
  expect(rec.quality).toBe('high')
  expect(rec.videoBitsPerSecond).toBe(5_000_000)
})

test('toggleVideoEnabled возвращает новое значение и меняет конфиг', async ({ page }) => {
  const initial = await page.evaluate(() => window.__valm.configurationController.getVideoConfig().enabled)
  const returned = await page.evaluate(() => window.__valm.configurationController.toggleVideoEnabled())
  const after = await page.evaluate(() => window.__valm.configurationController.getVideoConfig().enabled)
  expect(returned).toBe(!initial)
  expect(after).toBe(!initial)
})

test('exportConfig() → importConfig() — round-trip идентичен', async ({ page }) => {
  const roundtrip = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    cfg.setVideoResolution(640, 480)
    cfg.setVideoFrameRate(24)
    cfg.updateAudioConfig({ volumeThreshold: 33 })
    const exported = cfg.exportConfig()
    const before = JSON.parse(JSON.stringify(cfg.getConfig()))

    // меняем всё и импортируем обратно
    cfg.setVideoResolution(1280, 720)
    cfg.setVideoFrameRate(30)
    cfg.importConfig(exported)
    const after = JSON.parse(JSON.stringify(cfg.getConfig()))
    return { before, after, exportedIsString: typeof exported === 'string' }
  })

  expect(roundtrip.exportedIsString).toBe(true)
  expect(roundtrip.after).toEqual(roundtrip.before)
  expect(roundtrip.after.video.resolution).toEqual({ width: 640, height: 480 })
  expect(roundtrip.after.video.frameRate).toBe(24)
  expect(roundtrip.after.audio.volumeThreshold).toBe(33)
})

test('onChange шлёт ConfigurationChangeEvent с section/property/oldValue/newValue', async ({ page }) => {
  const events = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    const collected: any[] = []
    cfg.onChange((e: any) => collected.push(e))
    cfg.setVideoFrameRate(48)
    return collected
  })

  expect(events.length).toBeGreaterThan(0)
  const frameRateEvent = events.find((e) => e.property === 'frameRate')
  expect(frameRateEvent).toBeTruthy()
  expect(frameRateEvent.section).toBe('video')
  expect(frameRateEvent.newValue).toBe(48)
  expect(frameRateEvent).toHaveProperty('oldValue')
  expect(typeof frameRateEvent.timestamp).toBe('number')
})

test('onVideoChange реагирует только на видео-секцию', async ({ page }) => {
  const counts = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    let videoCount = 0
    cfg.onVideoChange(() => videoCount++)
    cfg.setVideoFrameRate(25) // видео
    cfg.updateAudioConfig({ volumeThreshold: 50 }) // аудио — не должно триггерить onVideoChange
    return { videoCount }
  })
  expect(counts.videoCount).toBeGreaterThan(0)
})

test('onReset вызывается при resetAll()', async ({ page }) => {
  const fired = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    let resetData: any = null
    cfg.onReset((d: any) => (resetData = d))
    cfg.setVideoFrameRate(59)
    cfg.resetAll()
    return { resetData, frameRateAfter: cfg.getVideoConfig().frameRate }
  })
  expect(fired.resetData).not.toBeNull()
  expect(fired.resetData).toHaveProperty('oldConfig')
  expect(fired.resetData).toHaveProperty('newConfig')
  expect(fired.frameRateAfter).toBe(30) // вернулось к дефолту
})

test('unsubscribe реально отписывает от onChange', async ({ page }) => {
  const count = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    let calls = 0
    const unsub = cfg.onChange(() => calls++)
    cfg.setVideoFrameRate(21)
    const afterFirst = calls
    unsub()
    cfg.setVideoFrameRate(22)
    return { afterFirst, afterUnsub: calls }
  })
  expect(count.afterFirst).toBeGreaterThan(0)
  expect(count.afterUnsub).toBe(count.afterFirst) // после отписки не растёт
})
