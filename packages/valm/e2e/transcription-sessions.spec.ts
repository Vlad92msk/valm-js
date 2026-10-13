import { test, expect, type Page } from '@playwright/test'
import { gotoFixture, newInitializedValm, destroyValm } from './helpers/setup'

// Поведение сессий распознавания на управляемой подмене Web Speech API:
// настоящий сервис в headless Chromium недетерминирован, а здесь важен порядок событий.

declare global {
  interface Window {
    __sr: any[]
    __srLog: any[]
  }
}

async function installFakeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__sr = []
    class FakeRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onstart: any = null
      onresult: any = null
      onerror: any = null
      onend: any = null
      running = false
      starts = 0
      stopCalls = 0
      abortCalls = 0

      constructor() {
        window.__sr.push(this)
      }
      start() {
        if (this.running) throw new DOMException('recognition has already started', 'InvalidStateError')
        this.running = true
        this.starts++
        setTimeout(() => this.running && this.onstart?.(), 0)
      }
      // Как в Chrome: onend приходит не сразу, а после ответа сервера. Тест шлёт его сам
      stop() {
        this.stopCalls++
      }
      abort() {
        this.abortCalls++
        setTimeout(() => this.end('aborted'), 0)
      }
      end(error?: string) {
        if (!this.running) return
        this.running = false
        if (error) this.onerror?.({ error })
        this.onend?.()
      }
      result(parts: Array<[string, boolean]>, resultIndex = 0) {
        const results: any = parts.map(([transcript, isFinal]) => Object.assign([{ transcript, confidence: 0.9 }], { isFinal }))
        this.onresult?.({ resultIndex, results })
      }
    }
    ;(window as any).SpeechRecognition = FakeRecognition
    ;(window as any).webkitSpeechRecognition = FakeRecognition
  })
}

async function setup(page: Page, transcription: Record<string, any> = {}, audio: Record<string, any> = { enabled: true }): Promise<void> {
  await installFakeSpeech(page)
  await gotoFixture(page)
  await newInitializedValm(page, { video: { enabled: false }, audio, transcription: { enabled: true, language: 'ru-RU', ...transcription } })
  await page.evaluate(() => {
    const t = window.__valm.transcriptionController
    window.__srLog = []
    t.onStateChange((s: any) => window.__srLog.push({ type: 'state', status: s.status, isActive: s.isActive, stopReason: s.stopReason }))
    t.onError((e: any) => window.__srLog.push({ type: 'error', action: e.action, code: e.code }))
    t.onTranscript((i: any) => window.__srLog.push({ type: 'item', text: i.text, isFinal: i.isFinal, resultIndex: i.resultIndex }))
    t.onTranscriptEvent((e: any) => window.__srLog.push({ type: 'event', final: e.final, interim: e.interim, items: e.items.length }))
  })
}

const state = (page: Page) => page.evaluate(() => window.__valm.transcriptionController.state)
const instances = (page: Page) =>
  page.evaluate(() => window.__sr.map((r) => ({ running: r.running, starts: r.starts, lang: r.lang, interim: r.interimResults, aborts: r.abortCalls })))
const log = (page: Page, type: string) => page.evaluate((t) => window.__srLog.filter((e) => e.type === t), type)
const waitStatus = (page: Page, status: string) =>
  page.waitForFunction((s) => window.__valm.transcriptionController.state.status === s, status, { timeout: 5000 })

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('status: starting → listening, isActive true с момента start()', async ({ page }) => {
  await setup(page)
  const first = await page.evaluate(async () => {
    await window.__valm.transcriptionController.start()
    return window.__valm.transcriptionController.state
  })
  expect(first).toMatchObject({ isActive: true, status: 'starting', stopReason: null })
  await waitStatus(page, 'listening')
  expect((await log(page, 'state')).map((s) => s.status)).toEqual(['starting', 'listening'])
})

test('stop() → start() подряд: поздний onend старой сессии не трогает новую', async ({ page }) => {
  await setup(page)
  await page.evaluate(async () => {
    const t = window.__valm.transcriptionController
    await t.start()
    t.stop()
    await t.start()
  })
  await waitStatus(page, 'listening')
  // Chrome закрывает старую сессию позже — уже после старта новой
  await page.evaluate(() => window.__sr[0].end())
  await page.waitForTimeout(400)

  expect(await state(page)).toMatchObject({ isActive: true, status: 'listening' })
  expect(await instances(page)).toMatchObject([
    { running: false, starts: 1 },
    { running: true, starts: 1 },
  ])
  expect(await log(page, 'error')).toEqual([])
})

test('результат остановленной сессии доходит, результат сессии в mute — нет', async ({ page }) => {
  await setup(page)
  await page.evaluate(async () => {
    const t = window.__valm.transcriptionController
    await t.start()
    t.stop()
    window.__sr[0].result([['последняя фраза', true]])
  })
  expect((await log(page, 'item')).map((i) => i.text)).toEqual(['последняя фраза'])

  await page.evaluate(async () => {
    await window.__valm.transcriptionController.start()
    await window.__valm.microphoneController.toggleMute()
    window.__sr[1].result([['сказано в mute', true]])
  })
  expect((await log(page, 'item')).map((i) => i.text)).toEqual(['последняя фраза'])
})

test("aborted: сессию забрала другая вкладка — остановка с причиной, без перезапуска", async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => window.__sr[0].end('aborted'))
  await page.waitForTimeout(500)

  expect(await state(page)).toMatchObject({ isActive: false, status: 'idle', stopReason: 'aborted' })
  expect(await instances(page)).toHaveLength(1)
  expect(await log(page, 'error')).toEqual([{ type: 'error', action: 'session', code: 'aborted' }])
  expect((await log(page, 'state')).at(-1)).toMatchObject({ status: 'idle', isActive: false, stopReason: 'aborted' })
})

test('network: перезапуск с растущей паузой, сброс после результата', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')

  await page.evaluate(() => window.__sr[0].end('network'))
  expect(await state(page)).toMatchObject({ isActive: true, status: 'restarting' })
  await page.waitForTimeout(600)
  expect(await instances(page)).toHaveLength(1) // первая пауза — 1 с
  await page.waitForFunction(() => window.__sr.length === 2, undefined, { timeout: 2000 })

  await page.evaluate(() => window.__sr[1].end('network'))
  await page.waitForTimeout(1400)
  expect(await instances(page)).toHaveLength(2) // вторая — 2 с
  await page.waitForFunction(() => window.__sr.length === 3, undefined, { timeout: 2000 })

  // Результат сбрасывает паузу
  await page.evaluate(() => {
    window.__sr[2].result([['привет', true]])
    window.__sr[2].end('network')
  })
  await page.waitForFunction(() => window.__sr.length === 4, undefined, { timeout: 1500 })
})

test('no-speech: перезапуск сразу', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => window.__sr[0].end('no-speech'))
  await page.waitForFunction(() => window.__sr.length === 2, undefined, { timeout: 600 })
  await waitStatus(page, 'listening')
})

test('фатальная ошибка: onStateChange получает остановку с причиной error', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => window.__sr[0].end('not-allowed'))

  expect(await state(page)).toMatchObject({ isActive: false, status: 'idle', stopReason: 'error' })
  expect((await log(page, 'state')).at(-1)).toMatchObject({ isActive: false, stopReason: 'error' })
  expect(await log(page, 'error')).toEqual([{ type: 'error', action: 'session', code: 'not-allowed' }])
})

test('onTranscriptEvent: одно событие распознавания — одно событие с final и interim', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => {
    const r = window.__sr[0]
    r.result([
      ['привет как', false],
      [' дела', false],
    ])
    r.result(
      [
        ['привет как дела', true],
        [' что', false],
        [' нового', false],
      ],
      0,
    )
    // меняется только хвост: незаконченный результат до resultIndex остаётся в interim
    r.result(
      [
        ['привет как дела', true],
        [' что', false],
        [' нового у тебя', false],
      ],
      2,
    )
  })

  expect(await log(page, 'event')).toEqual([
    { type: 'event', final: '', interim: 'привет как дела', items: 2 },
    { type: 'event', final: 'привет как дела', interim: 'что нового', items: 3 },
    { type: 'event', final: '', interim: 'что нового у тебя', items: 1 },
  ])
  expect((await log(page, 'item')).slice(0, 2)).toEqual([
    { type: 'item', text: 'привет как', isFinal: false, resultIndex: 0 },
    { type: 'item', text: ' дела', isFinal: false, resultIndex: 1 },
  ])
})

test('mute микрофона ставит распознавание на паузу, unmute возвращает', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  expect(await state(page)).toMatchObject({ isActive: true, status: 'paused' })
  expect(await instances(page)).toMatchObject([{ aborts: 1 }])
  await page.waitForTimeout(400)
  expect(await instances(page)).toHaveLength(1)
  expect(await log(page, 'error')).toEqual([]) // свой abort() ошибкой не считается

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  await waitStatus(page, 'listening')
  expect(await instances(page)).toMatchObject([{ running: false }, { running: true }])
})

test('start() при микрофоне в mute: paused без сессии, старт после unmute', async ({ page }) => {
  await setup(page)
  await page.evaluate(async () => {
    await window.__valm.microphoneController.toggleMute()
    await window.__valm.transcriptionController.start()
  })
  expect(await state(page)).toMatchObject({ isActive: true, status: 'paused' })
  expect(await instances(page)).toHaveLength(0)

  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  await waitStatus(page, 'listening')
})

test('pauseOnMute: false — mute не влияет на распознавание', async ({ page }) => {
  await setup(page, { pauseOnMute: false })
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => window.__valm.microphoneController.toggleMute())
  expect(await state(page)).toMatchObject({ isActive: true, status: 'listening' })
  expect(await instances(page)).toMatchObject([{ running: true, aborts: 0 }])
})

test('микрофон выключили и включили: распознавание возвращается само', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')

  await page.evaluate(() => window.__valm.microphoneController.disable())
  await waitStatus(page, 'paused')
  expect((await state(page)).isActive).toBe(true)

  await page.evaluate(() => window.__valm.microphoneController.enable())
  await waitStatus(page, 'listening')
  expect(await instances(page)).toHaveLength(2)
})

test('stop() при выключенном микрофоне: после включения распознавание не стартует', async ({ page }) => {
  await setup(page)
  await page.evaluate(async () => {
    await window.__valm.transcriptionController.start()
    window.__valm.microphoneController.disable()
  })
  await waitStatus(page, 'paused')
  await page.evaluate(async () => {
    window.__valm.transcriptionController.stop()
    await window.__valm.microphoneController.enable()
  })
  await page.waitForTimeout(300)
  expect(await state(page)).toMatchObject({ isActive: false, status: 'idle', stopReason: 'manual' })
  expect(await instances(page)).toHaveLength(1)
})

test('updateTranscriptionConfig({ language, interimResults }) перезапускает сессию', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')

  await page.evaluate(() => window.__valm.configurationController.updateTranscriptionConfig({ language: 'en-US' }))
  await waitStatus(page, 'listening')
  expect(await instances(page)).toMatchObject([
    { lang: 'ru-RU', running: false },
    { lang: 'en-US', running: true },
  ])
  expect((await state(page)).currentLanguage).toBe('en-US')

  await page.evaluate(() => window.__valm.configurationController.updateTranscriptionConfig({ interimResults: false }))
  await waitStatus(page, 'listening')
  expect((await instances(page)).at(-1)).toMatchObject({ lang: 'en-US', interim: false, running: true })

  // Не относящееся к сессии поле её не трогает
  await page.evaluate(() => window.__valm.configurationController.updateTranscriptionConfig({ saveTranscripts: true }))
  expect(await instances(page)).toHaveLength(3)
  expect(await log(page, 'error')).toEqual([])
})

test('start() бросил: состояние idle, экземпляр не удерживается, следующий start() работает', async ({ page }) => {
  await setup(page)
  const r = await page.evaluate(async () => {
    const t = window.__valm.transcriptionController
    const Original = (window as any).SpeechRecognition
    const proto = Original.prototype
    const start = proto.start
    proto.start = function () {
      throw new DOMException('boom', 'InvalidStateError')
    }
    let threw = false
    try {
      await t.start()
    } catch {
      threw = true
    }
    const failed = window.__sr[0]
    const afterFail = { ...t.state, handlers: [failed.onstart, failed.onresult, failed.onerror, failed.onend].filter(Boolean).length }
    proto.start = start
    await t.start()
    return { threw, afterFail, isActive: t.state.isActive }
  })
  expect(r.threw).toBe(true)
  expect(r.afterFail).toMatchObject({ isActive: false, status: 'idle', handlers: 0 })
  expect(r.isActive).toBe(true)
  expect(await log(page, 'error')).toEqual([{ type: 'error', action: 'start' }])
})

test('сессия закрывается сразу после старта (без ошибки): нет цикла перезапусков', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__valm.transcriptionController.start())
  await waitStatus(page, 'listening')
  await page.evaluate(() => window.__sr[0].end())
  await page.waitForTimeout(600)
  expect(await instances(page)).toHaveLength(1)
  await page.waitForFunction(() => window.__sr.length === 2, undefined, { timeout: 1500 })
})
