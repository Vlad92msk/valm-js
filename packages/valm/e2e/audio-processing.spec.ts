import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Аудио-обработка ядра: софтверный gain + визуализация (спектр/waveform).

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('setGain()/getGain() хранят множитель громкости', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__valm.microphoneController.setGain(2.5))
  const gain = await page.evaluate(() => window.__valm.microphoneController.getGain())
  expect(gain).toBe(2.5)
})

test('setGain() включает граф: публикуемый трек заменяется на обработанный', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  const rawId = await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id)

  await page.evaluate(() => window.__valm.microphoneController.setGain(2))

  // выход становится обработанным треком (destination графа), отличным от сырого
  await expect
    .poll(async () => page.evaluate(() => window.__valm.microphoneController.getTrack()?.id))
    .not.toBe(rawId)

  // и именно он лежит в публикуемом потоке
  const publishedId = await page.evaluate(() => window.__valm.mediaStreamService.getStream()?.getAudioTracks()[0]?.id)
  const outputId = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)
  expect(publishedId).toBe(outputId)
})

test('включение графа шлёт onTrackReplaced (audio)', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  await page.evaluate(() => {
    window.__events = []
    window.__valm.microphoneController.onTrackReplaced((e: any) => window.__events.push({ hasOld: !!e.oldTrack, hasNew: !!e.newTrack }))
  })

  await page.evaluate(() => window.__valm.microphoneController.setGain(2))

  await expect.poll(async () => (await page.evaluate(() => window.__events)).length).toBeGreaterThan(0)
  const events = await page.evaluate(() => window.__events)
  expect(events[0]).toEqual({ hasOld: true, hasNew: true })
})

test('onAudioData() поставляет спектр и waveform корректной длины', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())

  const sample = await page.evaluate(async () => {
    return await new Promise<{ freqLen: number; waveLen: number }>((resolve) => {
      const off = window.__valm.microphoneController.onAudioData((d: any) => {
        off()
        resolve({ freqLen: d.frequency.length, waveLen: d.waveform.length })
      })
    })
  })

  // fftSize=2048 → спектр 1024 бинов, waveform 2048 отсчётов
  expect(sample.freqLen).toBe(1024)
  expect(sample.waveLen).toBe(2048)
})

test('getFrequencyData()/getWaveformData() отдают данные при активном графе', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__valm.microphoneController.setGain(1.5))

  // ждём запуска графа
  await expect.poll(async () => page.evaluate(() => window.__valm.microphoneController.getFrequencyData().length)).toBe(1024)

  const lengths = await page.evaluate(() => ({
    freq: window.__valm.microphoneController.getFrequencyData().length,
    wave: window.__valm.microphoneController.getWaveformData().length,
  }))
  expect(lengths.freq).toBe(1024)
  expect(lengths.wave).toBe(2048)
})

test('getFrequencyData() без активного графа возвращает пустой массив', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  const len = await page.evaluate(() => window.__valm.microphoneController.getFrequencyData().length)
  expect(len).toBe(0)
})

test('обработанный трек переживает switchDevice, оставаясь обработанным', async ({ page }) => {
  const mics = await page.evaluate(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices()
    return devs.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map((d) => d.deviceId)
  })
  test.skip(mics.length < 2, 'Нужны минимум 2 микрофона')

  await page.evaluate((id) => window.__valm.microphoneController.enable(id), mics[0])
  await page.evaluate(() => window.__valm.microphoneController.setGain(2))
  await expect
    .poll(async () => page.evaluate(() => window.__valm.microphoneController.getTrack()?.id))
    .not.toBe(await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id))

  await page.evaluate((id) => window.__valm.microphoneController.switchDevice(id), mics[1])

  // после смены устройства выход всё ещё обработанный (≠ новому сырому треку)
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const out = window.__valm.microphoneController.getTrack()?.id
        const raw = window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack()?.id
        return out && raw && out !== raw
      })
    })
    .toBe(true)
})
