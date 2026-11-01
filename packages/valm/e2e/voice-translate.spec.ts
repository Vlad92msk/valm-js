import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// valm-js/voice-translate: плагин, контроллер, переводчик в аудио-графе микрофона.
// Сеть не трогаем: вместо Gemini — тестовый транспорт «эхо» (свой провайдер без правки ядра).
// Он возвращает присланный звук с задержкой и шлёт транскрипты — проверяем контракт целиком.

declare global {
  interface Window {
    __vt: any
    __vtEvents: { type: string; payload: any }[]
    __vtTransport: any
    __wsCount: number
  }
}

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => {
    // Счётчик WebSocket: при выключенном переводе соединений быть не должно
    window.__wsCount = 0
    const Native = window.WebSocket
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        window.__wsCount++
      }
    } as typeof WebSocket

    // Тестовый транспорт: вход 16 кГц, выход 24 кГц (как у Gemini), эхо через 200 мс
    window.__vtTransport = {
      info: {
        id: 'echo-test',
        label: 'Echo (test)',
        format: { inputSampleRate: 16000, outputSampleRate: 24000, chunkMs: 100 },
        languages: [
          { code: 'en', name: 'English' },
          { code: 'ru', name: 'Russian' },
        ],
        authModes: ['api-key'],
        capabilities: { sourceAutoDetect: true, sameLanguagePass: true, voiceSelection: false },
      },
      connects: [] as any[],
      chunks: [] as number[],
      closed: 0,
      ended: 0,
      events: null as any,
      failNext: null as any,
      connect(options: any, events: any) {
        this.connects.push({ ...options })
        this.events = events
        setTimeout(() => {
          if (this.events !== events) return
          events.onOpen()
          if (this.failNext) {
            events.onError(this.failNext)
            events.onClose({ code: 1011, willReconnect: false })
            this.failNext = null
            return
          }
          events.onRawEvent('setupComplete', { setupComplete: {} })
          events.onReady()
        }, 50)
      },
      sendAudio(pcm: Int16Array) {
        this.chunks.push(pcm.length)
        const events = this.events
        // 16 кГц → 24 кГц (повтор сэмплов) — эхо с задержкой
        const out = new Int16Array(Math.round(pcm.length * 1.5))
        for (let i = 0; i < out.length; i++) out[i] = pcm[Math.floor(i / 1.5)]
        setTimeout(() => events === this.events && events?.onAudio(out), 200)
        if (this.chunks.length === 5) {
          events.onTranscript({ kind: 'input', text: 'привет', isInterim: false, languageCode: 'ru' })
          events.onTranscript({ kind: 'output', text: 'hello', isInterim: false, languageCode: 'en' })
          events.onTurnComplete()
        }
      },
      endAudioStream() {
        this.ended++
      },
      close() {
        this.closed++
        this.events = null
      },
    }
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  await page.evaluate(() => {
    const plugin = new window.VoiceTranslate.VoiceTranslatePlugin()
    window.__valm.use(plugin)
    window.__vt = window.__valm.voiceTranslateController
    window.__vtEvents = []
    window.__vt.onAny((e: any) => window.__vtEvents.push({ type: e.type, payload: e.type === 'providerEvent' || e.type === 'stateChanged' ? null : e.payload }))
  })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

const eventTypes = (page: import('@playwright/test').Page) => page.evaluate(() => window.__vtEvents.map((e) => e.type))

test('установленный плагин без enable() ничего не трогает', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  const rawId = await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id)

  await page.waitForTimeout(300)
  const result = await page.evaluate(() => ({
    trackId: window.__valm.microphoneController.getTrack()?.id,
    running: window.__valm.mediaStreamService.getAudioProcessingPipeline().isRunning(),
    slot: window.__valm.mediaStreamService.getAudioProcessingPipeline().getProcessor('voice-translation'),
    state: window.__vt.state,
    ws: window.__wsCount,
  }))
  expect(result.trackId).toBe(rawId)
  expect(result.running).toBe(false)
  expect(result.slot).toBeNull()
  expect(result.state.isEnabled).toBe(false)
  expect(result.state.status).toBe('idle')
  expect(result.ws).toBe(0)
})

test('enable(): сессия открывается, звук уходит чанками по 100 мс, перевод и события приходят', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  const rawId = await page.evaluate(() => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack().id)

  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))

  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
  // граф включён → публикуемая дорожка — выход графа
  expect(await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)).not.toBe(rawId)

  await expect.poll(() => page.evaluate(() => window.__vtTransport.chunks.length), { timeout: 5000 }).toBeGreaterThan(5)
  // 16 кГц × 100 мс
  expect(await page.evaluate(() => window.__vtTransport.chunks[0])).toBe(1600)
  expect(await page.evaluate(() => window.__vtTransport.connects[0])).toEqual({ targetLanguage: 'en', sameLanguageSpeech: 'pass' })

  await expect.poll(() => eventTypes(page)).toContain('translatedAudio')
  const types = await eventTypes(page)
  for (const t of ['enabled', 'statusChanged', 'sessionOpened', 'transcript', 'languageDetected', 'turnComplete', 'providerEvent']) {
    expect(types).toContain(t)
  }

  const transcripts = await page.evaluate(() => window.__vtEvents.filter((e) => e.type === 'transcript').map((e) => e.payload))
  expect(transcripts.some((t: any) => t.kind === 'output' && t.isFinal && t.turnText === 'hello')).toBe(true)
  expect(await page.evaluate(() => window.__vt.state.detectedLanguage)).toBe('ru')
  expect(await page.evaluate(() => window.__vt.state.usage.inputSeconds)).toBeGreaterThan(0)
})

test('смена языка переподключает сессию; неподдерживаемый язык — ошибка', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')

  await page.evaluate(() => window.__vt.setTargetLanguage('ru'))
  await expect.poll(() => page.evaluate(() => window.__vtTransport.connects.length)).toBe(2)
  expect(await page.evaluate(() => window.__vtTransport.connects[1].targetLanguage)).toBe('ru')
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
  const reconnects = await page.evaluate(() => window.__vtEvents.filter((e) => e.type === 'reconnecting').map((e) => e.payload.reason))
  expect(reconnects).toContain('language-changed')

  const message = await page.evaluate(() => {
    try {
      window.__vt.setTargetLanguage('xx')
      return ''
    } catch (e: any) {
      return e.message
    }
  })
  expect(message).toContain('not supported')
})

test('disable(): сессия закрыта, слот пуст, дорожка не заменяется', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
  const trackBefore = await page.evaluate(() => window.__valm.microphoneController.getTrack()?.id)

  await page.evaluate(() => window.__vt.disable())
  const result = await page.evaluate(() => ({
    trackId: window.__valm.microphoneController.getTrack()?.id,
    slot: window.__valm.mediaStreamService.getAudioProcessingPipeline().getProcessor('voice-translation'),
    closed: window.__vtTransport.closed,
    state: window.__vt.state,
  }))
  expect(result.trackId).toBe(trackBefore)
  expect(result.slot).toBeNull()
  expect(result.closed).toBeGreaterThan(0)
  expect(result.state.isEnabled).toBe(false)
  expect(await eventTypes(page)).toContain('disabled')
})

test('ошибка сервиса: статус error с причиной, событие error', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => {
    window.__vtTransport.failNext = { reason: 'quota', message: 'RESOURCE_EXHAUSTED', code: 429 }
    return window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' })
  })
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('error')
  const state = await page.evaluate(() => window.__vt.state)
  expect(state.error.reason).toBe('quota')
  expect(state.error.providerId).toBe('echo-test')
  const errors = await page.evaluate(() => window.__vtEvents.filter((e) => e.type === 'error').map((e) => e.payload.reason))
  expect(errors).toEqual(['quota'])
})

test('mute микрофона приостанавливает отправку звука', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  await expect.poll(() => page.evaluate(() => window.__vtTransport.chunks.length), { timeout: 5000 }).toBeGreaterThan(2)

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  expect(await page.evaluate(() => window.__vt.state.isInputPaused)).toBe(true)
  expect(await page.evaluate(() => window.__vtTransport.ended)).toBe(1)
  const sent = await page.evaluate(() => window.__vtTransport.chunks.length)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__vtTransport.chunks.length)).toBe(sent)

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  await expect.poll(() => page.evaluate(() => window.__vtTransport.chunks.length)).toBeGreaterThan(sent)
})

test('Gemini: транспорт объявляет форматы, языки и способы доступа', async ({ page }) => {
  const info = await page.evaluate(() => {
    const transport = new window.VoiceTranslate.GeminiLiveTranslateTransport({ auth: { type: 'api-key', apiKey: 'not-a-key' } })
    return transport.info
  })
  expect(info.format).toEqual({ inputSampleRate: 16000, outputSampleRate: 24000, chunkMs: 100 })
  expect(info.languages.length).toBeGreaterThanOrEqual(70)
  expect(info.languages.map((l: any) => l.code)).toEqual(expect.arrayContaining(['en', 'ru', 'tr', 'zh-Hans', 'pt-BR']))
  expect(info.authModes).toEqual(['api-key', 'ephemeral-token'])
  // конструктор не открывает соединение
  expect(await page.evaluate(() => window.__wsCount)).toBe(0)
})

test('микрофон выключен — сессия закрыта; включён снова — сессия открывается заново', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')

  await page.evaluate(() => window.__valm.microphoneController.disable())
  expect(await page.evaluate(() => window.__vt.state.status)).toBe('idle')
  expect(await page.evaluate(() => window.__vtTransport.closed)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__vt.state.isEnabled)).toBe(true)

  await page.evaluate(() => window.__valm.microphoneController.enable())
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
  expect(await page.evaluate(() => window.__vtTransport.connects.length)).toBe(2)
})

test('enable() до включения микрофона: сессия откроется вместе с микрофоном', async ({ page }) => {
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  expect(await page.evaluate(() => window.__vtTransport.connects.length)).toBe(0)
  expect(await page.evaluate(() => window.__vt.state.isEnabled)).toBe(true)

  await page.evaluate(() => window.__valm.microphoneController.enable())
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
})

// Уровень публикуемой дорожки (то, что уйдёт в звонок / в монитор), RMS 0..1 за ~600 мс
const measureOutputRms = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const track = window.__valm.microphoneController.getTrack()
    const ctx = new AudioContext()
    await ctx.resume()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let max = 0
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 50))
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      max = Math.max(max, Math.sqrt(sum / buf.length))
    }
    await ctx.close()
    return max
  })

test('перевод реально звучит на выходе: в публикуемой дорожке есть звук эха', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' }))
  await expect.poll(() => page.evaluate(() => window.__vt.state.status)).toBe('active')
  await expect.poll(() => eventTypes(page)).toContain('translatedAudio')

  expect(await measureOutputRms(page)).toBeGreaterThan(0.01)
  await expect.poll(() => page.evaluate(() => window.__vt.state.activity)).toBe('translating')
})

test('до готовности сессии на выходе тишина, а не оригинал', async ({ page }) => {
  await page.evaluate(() => window.__valm.microphoneController.enable())
  await page.evaluate(() => {
    // транспорт, который никогда не становится готовым
    window.__vtTransport.connect = function () {}
    return window.__vt.enable({ transport: window.__vtTransport, targetLanguage: 'en' })
  })
  expect(await measureOutputRms(page)).toBeLessThan(0.001)
})
