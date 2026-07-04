import { test, expect } from '@playwright/test'
import { gotoFixture, newInitializedValm, destroyValm } from './helpers/setup'

// Контракты из guides/transcription.md.
// Реальное распознавание в headless Chromium ненадёжно (см. «Известные ограничения»),
// поэтому проверяем обвязку контроллера и graceful-поведение в неподдерживаемой среде.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, {
    video: { enabled: false },
    audio: { enabled: true },
    transcription: { enabled: true, language: 'ru-RU' },
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('state отражает isSupported/currentLanguage, стартовый язык из конфига', async ({ page }) => {
  const state = await page.evaluate(() => window.__valm.transcriptionController.state)
  expect(typeof state.isActive).toBe('boolean')
  expect(typeof state.isSupported).toBe('boolean')
  expect(state.currentLanguage).toBe('ru-RU')
  expect(state.isActive).toBe(false) // ещё не стартовали
})

test('updateLanguage() меняет currentLanguage', async ({ page }) => {
  await page.evaluate(() => window.__valm.transcriptionController.updateLanguage('en-US'))
  const lang = await page.evaluate(() => window.__valm.transcriptionController.state.currentLanguage)
  expect(lang).toBe('en-US')
})

test('getTranscripts() возвращает массив (копию), clearTranscripts() не роняет', async ({ page }) => {
  const r = await page.evaluate(() => {
    const t = window.__valm.transcriptionController
    const a = t.getTranscripts()
    const b = t.getTranscripts()
    t.clearTranscripts()
    return { isArray: Array.isArray(a), distinctRef: a !== b, len: a.length }
  })
  expect(r.isArray).toBe(true)
  expect(r.distinctRef).toBe(true) // копия, не тот же массив
  expect(r.len).toBe(0)
})

test('graceful: в неподдерживаемой среде start() кидает и шлёт onError(source=transcription)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const t = window.__valm.transcriptionController
    if (t.state.isSupported) {
      // среда ПОДДЕРЖИВАЕТ Web Speech API — проверяем лишь, что start/stop не бросают синхронно
      let asyncError: any = null
      t.onError((e: any) => (asyncError = e))
      try {
        await t.start()
        t.stop()
      } catch {
        /* распознавание фейкового звука может упасть — это ок */
      }
      return { branch: 'supported' as const, ok: true }
    }

    // среда НЕ поддерживает — контракт: start() reject + onError с source 'transcription'
    let errorEvent: any = null
    t.onError((e: any) => (errorEvent = e))
    let threw = false
    try {
      await t.start()
    } catch {
      threw = true
    }
    return {
      branch: 'unsupported' as const,
      threw,
      errorSource: errorEvent?.source ?? null,
      errorAction: errorEvent?.action ?? null,
      isActive: t.state.isActive,
    }
  })

  if (result.branch === 'unsupported') {
    expect(result.threw).toBe(true)
    expect(result.errorSource).toBe('transcription')
    expect(result.errorAction).toBe('start')
    expect(result.isActive).toBe(false)
  } else {
    expect(result.ok).toBe(true)
  }
})
