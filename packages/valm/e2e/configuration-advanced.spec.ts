import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Доп. контракты configuration.md, не покрытые configuration.spec.ts:
// битый JSON при импорте, пер-секционные reset, валидаторы, события onUpdate/onReset/onImport.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('importConfig() с битым JSON бросает, не разрушая текущий конфиг', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    const before = cfg.getConfig()
    let threw = false
    try {
      cfg.importConfig('{ это не валидный json ')
    } catch {
      threw = true
    }
    const after = cfg.getConfig()
    return { threw, same: JSON.stringify(before) === JSON.stringify(after) }
  })

  expect(result.threw).toBe(true)
  expect(result.same).toBe(true) // конфиг не тронут при провале парсинга
})

test('exportConfig() → importConfig() round-trip идентичен и шлёт onImport', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    cfg.setVideoResolution(800, 600)
    const exported = cfg.exportConfig()

    let imported: any = null
    cfg.onImport((data: any) => (imported = data))

    cfg.setVideoResolution(320, 240) // меняем, чтобы импорт реально откатил
    cfg.importConfig(exported)

    return {
      width: cfg.getVideoConfig().resolution.width,
      importedFired: imported !== null,
      hasOldNew: imported && 'oldConfig' in imported && 'newConfig' in imported,
    }
  })

  expect(result.width).toBe(800) // импорт восстановил экспортированное значение
  expect(result.importedFired).toBe(true)
  expect(result.hasOldNew).toBe(true)
})

test('onUpdate срабатывает на updateXxxConfig с полными old/new конфигами', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    const updates: any[] = []
    cfg.onUpdate((data: any) => updates.push(data))

    cfg.updateVideoConfig({ frameRate: 24 })
    cfg.updateAudioConfig({ enabled: true })

    return {
      count: updates.length,
      firstHasConfigs: updates[0] && 'oldConfig' in updates[0] && 'newConfig' in updates[0],
      // old/new действительно различаются по обновлённому полю
      frameRateChanged: updates[0] && updates[0].oldConfig.video.frameRate !== updates[0].newConfig.video.frameRate,
      newFrameRate: updates[0]?.newConfig.video.frameRate,
    }
  })

  expect(result.count).toBe(2) // по одному на каждый updateXxxConfig
  expect(result.firstHasConfigs).toBe(true)
  expect(result.frameRateChanged).toBe(true)
  expect(result.newFrameRate).toBe(24)
})

test('пер-секционный resetVideoConfig() восстанавливает дефолты и шлёт onReset', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    cfg.setVideoResolution(320, 240)
    cfg.setVideoFrameRate(15)

    let reset: any = null
    cfg.onReset((data: any) => (reset = data))

    cfg.resetVideoConfig()

    const v = cfg.getVideoConfig()
    return {
      width: v.resolution.width,
      frameRate: v.frameRate,
      resetFired: reset !== null,
      hasOldNew: reset && 'oldConfig' in reset && 'newConfig' in reset,
    }
  })

  // дефолты из DEFAULT_VIDEO_CONFIG
  expect(result.width).toBe(1280)
  expect(result.frameRate).toBe(30)
  expect(result.resetFired).toBe(true) // onReset теперь срабатывает и на пер-секционном reset
  expect(result.hasOldNew).toBe(true)
})

test('resetAll() шлёт onReset и восстанавливает дефолты всех секций', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    cfg.setVideoResolution(320, 240)
    cfg.updateAudioConfig({ enabled: true })

    let reset: any = null
    cfg.onReset((data: any) => (reset = data))

    cfg.resetAll()
    return {
      width: cfg.getVideoConfig().resolution.width,
      audioEnabled: cfg.getAudioConfig().enabled,
      resetFired: reset !== null,
    }
  })

  expect(result.width).toBe(1280)
  expect(result.audioEnabled).toBe(false)
  expect(result.resetFired).toBe(true)
})

test('валидаторы отклоняют невалидные значения, не меняя конфиг', async ({ page }) => {
  const result = await page.evaluate(() => {
    const cfg = window.__valm.configurationController
    const check = (fn: () => void) => {
      try {
        fn()
        return 'accepted'
      } catch {
        return 'rejected'
      }
    }

    return {
      // frameRate вне (0;120]
      frameRateZero: check(() => cfg.setVideoFrameRate(0)),
      frameRateHuge: check(() => cfg.setVideoFrameRate(999)),
      frameRateOk: check(() => cfg.setVideoFrameRate(30)),
      // resolution вне (0;4096]
      resNegative: check(() => cfg.setVideoResolution(-100, 200)),
      resOk: check(() => cfg.setVideoResolution(640, 480)),
      // отрицательный screenShare.maxFrameRate
      shNegative: check(() => cfg.updateScreenShareConfig({ maxFrameRate: -5 } as any)),
      // конфиг не сломан: последнее валидное значение осталось
      finalFrameRate: cfg.getVideoConfig().frameRate,
      finalWidth: cfg.getVideoConfig().resolution.width,
    }
  })

  expect(result.frameRateZero).toBe('rejected')
  expect(result.frameRateHuge).toBe('rejected')
  expect(result.frameRateOk).toBe('accepted')
  expect(result.resNegative).toBe('rejected')
  expect(result.resOk).toBe('accepted')
  expect(result.shNegative).toBe('rejected')
  expect(result.finalFrameRate).toBe(30)
  expect(result.finalWidth).toBe(640)
})
