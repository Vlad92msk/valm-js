import { test, expect } from '@playwright/test'
import { gotoFixture } from './helpers/setup'

// Контракты из guides/utilities.md. Чистые утилиты — гоняем в браузере (нужен реальный
// navigator/AudioContext), но без Valm-инстанса.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
})

test('DeviceDetector: методы возвращают boolean и согласованы для desktop Chromium', async ({ page }) => {
  const d = await page.evaluate(() => {
    const D = window.Valm.DeviceDetector
    return {
      isMobile: D.isMobile(),
      isIOS: D.isIOS(),
      isAndroid: D.isAndroid(),
      isDesktop: D.isDesktop(),
      isSafari: D.isSafari(),
      isIOSSafari: D.isIOSSafari(),
      isIOSChrome: D.isIOSChrome(),
      isTouchDevice: D.isTouchDevice(),
    }
  })
  // все булевы
  Object.values(d).forEach((v) => expect(typeof v).toBe('boolean'))
  // headless desktop Chromium: не iOS/Android, desktop === !mobile
  expect(d.isIOS).toBe(false)
  expect(d.isAndroid).toBe(false)
  expect(d.isDesktop).toBe(!d.isMobile)
  expect(d.isIOSSafari).toBe(false)
  expect(d.isIOSChrome).toBe(false)
})

test('isIOS() helper делегирует DeviceDetector и на desktop === false', async ({ page }) => {
  const res = await page.evaluate(() => ({
    isIOS: window.Valm.isIOS(),
    isIOSSafari: window.Valm.isIOSSafari(),
    isIOSChrome: window.Valm.isIOSChrome(),
    matchesDetector: window.Valm.isIOS() === window.Valm.DeviceDetector.isIOS(),
  }))
  expect(res.isIOS).toBe(false)
  expect(res.matchesDetector).toBe(true)
})

test('TypedEventEmitter: on/emit/off и unsubscribe работают', async ({ page }) => {
  const r = await page.evaluate(() => {
    const emitter = new window.Valm.TypedEventEmitter<{ ping: (n: number) => void }>()
    const got: number[] = []
    const unsub = emitter.on('ping', (n: number) => got.push(n))
    emitter.emit('ping', 1)
    emitter.emit('ping', 2)
    const count = emitter.listenerCount('ping')
    unsub()
    emitter.emit('ping', 3) // после отписки — не ловим
    return { got, count }
  })
  expect(r.got).toEqual([1, 2])
  expect(r.count).toBe(1)
})

test('VoiceActivityDetector: реагирует на фейковый аудио-тон через onStateChange', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = stream.getAudioTracks()[0]
    const vad = new window.Valm.VoiceActivityDetector({ volumeThreshold: 5, silenceTimeout: 500 })
    const states: Array<{ volume: number; isSpeaking: boolean }> = []
    vad.onStateChange((s: any) => states.push({ volume: s.volume, isSpeaking: s.isSpeaking }))
    vad.start(track)
    await new Promise((res) => setTimeout(res, 2500))
    vad.stop()
    track.stop()
    return {
      count: states.length,
      hasNumericVolume: states.every((s) => typeof s.volume === 'number'),
      maxVolume: states.reduce((m, s) => Math.max(m, s.volume), 0),
    }
  })
  expect(r.count).toBeGreaterThan(0)
  expect(r.hasNumericVolume).toBe(true)
  // фейковый тон должен дать ненулевую громкость
  expect(r.maxVolume).toBeGreaterThan(0)
})

test('VoiceActivityDetector.updateConfig() не роняет анализ', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = stream.getAudioTracks()[0]
    const vad = new window.Valm.VoiceActivityDetector({ volumeThreshold: 20, silenceTimeout: 800 })
    vad.start(track)
    vad.updateConfig({ volumeThreshold: 40 })
    await new Promise((res) => setTimeout(res, 200))
    vad.stop()
    track.stop()
    return true
  })
  expect(ok).toBe(true)
})
