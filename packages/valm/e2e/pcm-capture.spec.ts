import { test, expect } from '@playwright/test'
import { gotoFixture } from './helpers/setup'

// valm-js/pcm-capture: узел захвата PCM16 из любого аудио-входа (без воспроизведения).
// Источник — OscillatorNode известной частоты или фейковый микрофон Chromium (тон).

declare global {
  interface Window {
    __ctx: AudioContext
    __cap: any
    __chunks: { len: number; rms: number; at: number; pcm?: number[] }[]
  }
}

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await page.evaluate(() => {
    window.__ctx = new AudioContext({ sampleRate: 48000 })
    window.__chunks = []
  })
})

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    window.__cap?.dispose()
    window.__cap = undefined
    await window.__ctx?.close()
  })
})

// Подать синус freq Гц в новый PcmCapture и собирать чанки (keepPcm — сохранить сэмплы первых чанков)
const startTone = (page: import('@playwright/test').Page, freq: number, options: Record<string, unknown> = {}, keepPcm = false) =>
  page.evaluate(
    async ({ freq, options, keepPcm }) => {
      const ctx = window.__ctx
      await ctx.resume()
      const osc = new OscillatorNode(ctx, { frequency: freq })
      const gain = new GainNode(ctx, { gain: 0.5 })
      osc.connect(gain)
      osc.start()
      const cap = await window.PcmCapture.PcmCapture.create(ctx, options)
      gain.connect(cap.node)
      window.__cap = cap
      cap.onChunk((c: { pcm: Int16Array; rms: number }) => {
        window.__chunks.push({
          len: c.pcm.length,
          rms: c.rms,
          at: performance.now(),
          pcm: keepPcm && window.__chunks.length < 20 ? Array.from(c.pcm) : undefined,
        })
      })
    },
    { freq, options, keepPcm },
  )

const chunkCount = (page: import('@playwright/test').Page) => page.evaluate(() => window.__chunks.length)

test('по умолчанию: 16 кГц, чанки по 100 мс (1600 сэмплов), около 10 в секунду, RMS синуса', async ({ page }) => {
  await startTone(page, 440)
  await page.waitForTimeout(1200)
  const chunks = await page.evaluate(() => window.__chunks)
  const info = await page.evaluate(() => ({ rate: window.__cap.sampleRate, ms: window.__cap.chunkMs, outputs: window.__cap.node.numberOfOutputs }))

  expect(info).toEqual({ rate: 16000, ms: 100, outputs: 0 })
  expect(chunks.length).toBeGreaterThanOrEqual(8)
  expect(chunks.length).toBeLessThanOrEqual(14)
  expect(chunks.every((c) => c.len === 1600)).toBe(true)
  // синус амплитуды 0.5 → RMS 0.5/√2 ≈ 0.354 (первый чанк — разгон фильтра, пропускаем)
  for (const c of chunks.slice(1)) expect(c.rms).toBeCloseTo(0.354, 1)
})

test('свои sampleRate и chunkMs: 24 кГц × 250 мс = 6000 сэмплов', async ({ page }) => {
  await startTone(page, 440, { sampleRate: 24000, chunkMs: 250 })
  await page.waitForFunction(() => window.__chunks.length >= 3)
  const lens = await page.evaluate(() => window.__chunks.map((c) => c.len))
  expect(lens.every((n) => n === 6000)).toBe(true)
})

test('ресемплинг сохраняет частоту: 1 кГц на 48 кГц → 1 кГц в выходе 16 кГц', async ({ page }) => {
  await startTone(page, 1000, {}, true)
  await page.waitForFunction(() => window.__chunks.length >= 6)
  const pcm = await page.evaluate(() => window.__chunks.slice(2, 6).flatMap((c) => c.pcm ?? []))
  // переходы через ноль вверх → частота
  let crossings = 0
  for (let i = 1; i < pcm.length; i++) if (pcm[i - 1] < 0 && pcm[i] >= 0) crossings++
  const seconds = pcm.length / 16000
  expect(crossings / seconds).toBeGreaterThan(980)
  expect(crossings / seconds).toBeLessThan(1020)
})

test('тишина на входе (ничего не подключено) — поток не прерывается, RMS 0', async ({ page }) => {
  await page.evaluate(async () => {
    await window.__ctx.resume()
    const cap = await window.PcmCapture.PcmCapture.create(window.__ctx)
    window.__cap = cap
    cap.onChunk((c: { pcm: Int16Array; rms: number }) => window.__chunks.push({ len: c.pcm.length, rms: c.rms, at: performance.now() }))
  })
  await page.waitForTimeout(600)
  const chunks = await page.evaluate(() => window.__chunks)
  expect(chunks.length).toBeGreaterThanOrEqual(4)
  expect(chunks.every((c) => c.rms === 0 && c.len === 1600)).toBe(true)
})

test('setPaused(true) останавливает поток, setPaused(false) возобновляет', async ({ page }) => {
  await startTone(page, 440)
  await page.waitForFunction(() => window.__chunks.length >= 3)

  await page.evaluate(() => window.__cap.setPaused(true))
  expect(await page.evaluate(() => window.__cap.isPaused)).toBe(true)
  const atPause = await chunkCount(page)
  await page.waitForTimeout(500)
  expect(await chunkCount(page)).toBe(atPause)

  await page.evaluate(() => window.__cap.setPaused(false))
  const resumedAt = await page.evaluate(() => performance.now())
  await page.waitForFunction((n) => window.__chunks.length >= n + 3, atPause)
  const after = await page.evaluate((t) => window.__chunks.filter((c) => c.at >= t), resumedAt)
  expect(after.every((c) => c.len === 1600)).toBe(true)
  // ворклет на паузе не копил: первый чанк после паузы приходит не раньше, чем через ~chunkMs
  expect(after[0].at - resumedAt).toBeGreaterThan(50)
})

test('create({ paused: true }) — чанков нет до setPaused(false)', async ({ page }) => {
  await startTone(page, 440, { paused: true })
  await page.waitForTimeout(400)
  expect(await chunkCount(page)).toBe(0)
  await page.evaluate(() => window.__cap.setPaused(false))
  await page.waitForFunction(() => window.__chunks.length >= 2)
})

test('onChunk возвращает отписку; dispose() останавливает всё и идемпотентен', async ({ page }) => {
  await startTone(page, 440)
  const second = await page.evaluate(async () => {
    let n = 0
    const off = window.__cap.onChunk(() => n++)
    await new Promise((r) => setTimeout(r, 350))
    off()
    const atOff = n
    await new Promise((r) => setTimeout(r, 300))
    return { atOff, final: n }
  })
  expect(second.atOff).toBeGreaterThan(0)
  expect(second.final).toBe(second.atOff)

  await page.evaluate(() => {
    window.__cap.dispose()
    window.__cap.dispose()
  })
  const atDispose = await chunkCount(page)
  await page.waitForTimeout(400)
  expect(await chunkCount(page)).toBe(atDispose)
  expect(await page.evaluate(() => window.__cap.isDisposed)).toBe(true)
})

test('несколько узлов на одном контексте, в том числе созданных параллельно', async ({ page }) => {
  const lens = await page.evaluate(async () => {
    const ctx = window.__ctx
    await ctx.resume()
    const caps = await Promise.all([
      window.PcmCapture.PcmCapture.create(ctx),
      window.PcmCapture.PcmCapture.create(ctx, { sampleRate: 24000 }),
      window.PcmCapture.PcmCapture.create(ctx, { chunkMs: 250 }),
    ])
    const osc = new OscillatorNode(ctx, { frequency: 300 })
    osc.start()
    const got: number[] = [0, 0, 0]
    caps.forEach((cap, i) => {
      osc.connect(cap.node)
      cap.onChunk((c: { pcm: Int16Array }) => (got[i] = c.pcm.length))
    })
    await new Promise((r) => setTimeout(r, 600))
    caps.forEach((cap) => cap.dispose())
    osc.stop()
    return got
  })
  expect(lens).toEqual([1600, 2400, 4000])
})

test('удалённый трек через MediaStreamAudioSourceNode (фейковый микрофон) даёт чанки с громкостью', async ({ page }) => {
  await page.evaluate(async () => {
    const ctx = window.__ctx
    await ctx.resume()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const src = ctx.createMediaStreamSource(stream)
    const cap = await window.PcmCapture.PcmCapture.create(ctx)
    src.connect(cap.node)
    window.__cap = cap
    cap.onChunk((c: { pcm: Int16Array; rms: number }) => window.__chunks.push({ len: c.pcm.length, rms: c.rms, at: performance.now() }))
  })
  await page.waitForFunction(() => window.__chunks.filter((c) => c.rms > 0.01).length >= 3)
})

test('неверные параметры — RangeError', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const out: string[] = []
    for (const opts of [{ sampleRate: 0 }, { chunkMs: -1 }, { sampleRate: Number.NaN }]) {
      try {
        await window.PcmCapture.PcmCapture.create(window.__ctx, opts)
        out.push('ok')
      } catch (e) {
        out.push((e as Error).name)
      }
    }
    return out
  })
  expect(errors).toEqual(['RangeError', 'RangeError', 'RangeError'])
})

test('кодек экспортирован из подпути', async ({ page }) => {
  const roundtrip = await page.evaluate(() => {
    const { pcm16ToBase64, base64ToPcm16 } = window.PcmCapture
    return Array.from(base64ToPcm16(pcm16ToBase64(new Int16Array([0, 1, -1, 32767, -32768]))))
  })
  expect(roundtrip).toEqual([0, 1, -1, 32767, -32768])
})
