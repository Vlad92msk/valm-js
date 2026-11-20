// Прогон страницы /bench (замер видеоэффектов valm, T563) в Chromium через Playwright.
//
//   node packages/homepage/scripts/effects-bench.mjs
//
// Переменные окружения:
//   URL       адрес уже запущенной страницы (по умолчанию скрипт сам поднимает vite homepage на PORT)
//   PORT      порт vite, если URL не задан (5292)
//   VIDEO     .y4m для фейковой камеры (человек в кадре; без него — тестовый узор Chromium, маска пустая)
//   MODES     пути маски через запятую: gpu,cpu (по умолчанию gpu)
//   SCEN      сценарии: none,blur,bg
//   THR       CPU-троттлинг Chromium: 1,4
//   REPS      повторов на точку (3), DUR — окно замера, с (20), WARM — прогрев, с (5)
//   HEADLESS  1 — без окна (WebGL на SwiftShader: модель машины без GPU)
//   OUT       путь для JSON с сырыми цифрами
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const here = path.dirname(fileURLToPath(import.meta.url))
const homepageDir = path.resolve(here, '..')

const env = process.env
const PORT = Number(env.PORT || 5292)
const DUR = Number(env.DUR || 20) * 1000
const WARM = Number(env.WARM || 5) * 1000
const REPS = Number(env.REPS || 3)
const HEADLESS = env.HEADLESS === '1'
const MODES = (env.MODES || 'gpu').split(',')
const SCENARIOS = (env.SCEN || 'none,blur,bg').split(',')
const THROTTLES = (env.THR || '1,4').split(',').map(Number)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // ещё не поднялся
    }
    await sleep(300)
  }
  throw new Error(`Страница не открылась: ${url}`)
}

let vite = null
let baseUrl = env.URL
if (!baseUrl) {
  vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: homepageDir, stdio: 'ignore' })
  baseUrl = `http://localhost:${PORT}/bench`
  await waitForUrl(`http://localhost:${PORT}/`, 60_000)
}

const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
if (env.VIDEO) args.push(`--use-file-for-fake-video-capture=${path.resolve(env.VIDEO)}`)
if (HEADLESS) args.push('--enable-unsafe-swiftshader')

const browser = await chromium.launch({ headless: HEADLESS, args })
const rows = []

try {
  const context = await browser.newContext({ permissions: ['camera'] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(baseUrl)
  await page.waitForFunction(() => window.__effectsBench?.ready, null, { timeout: 60_000 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')

  const metrics = async () => {
    const { metrics: list } = await cdp.send('Performance.getMetrics')
    const get = (name) => list.find((m) => m.name === name)?.value ?? 0
    return { task: get('TaskDuration'), ts: get('Timestamp') }
  }

  for (const mode of MODES) {
    await page.evaluate((gpuMask) => window.__effectsBench.setOptions({ gpuMask }), mode !== 'cpu')
    const info = await page.evaluate(() => window.__effectsBench.info())
    console.log(`\n# mode=${mode}  delegate=${info?.delegate}  webgl=${info?.renderer}  camera=${info?.resolution}`)

    for (const thr of THROTTLES) {
      for (const scenario of SCENARIOS) {
        for (let rep = 1; rep <= REPS; rep++) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr })
          await page.evaluate((s) => window.__effectsBench.setScenario(s), scenario)
          await sleep(WARM)
          const before = await metrics()
          const snap = await page.evaluate((ms) => window.__effectsBench.measure(ms), DUR)
          const after = await metrics()
          const after_info = await page.evaluate(() => window.__effectsBench.info())
          const row = {
            mode,
            thr,
            scenario,
            rep,
            mainCpuPct: (100 * (after.task - before.task)) / (after.ts - before.ts),
            gpuMaskActive: after_info?.gpuMaskActive ?? null,
            preset: after_info?.preset,
            ...snap,
          }
          rows.push(row)
          console.log(
            `${mode} x${thr} ${scenario.padEnd(4)} #${rep}: main ${row.mainCpuPct.toFixed(0)}%  effect ${snap.effectBusyPct.toFixed(1)}%  out ${snap.outFps.toFixed(1)} fps  frame ${snap.frame ? snap.frame.mean.toFixed(1) : '—'} ms  seg ${snap.segmentation ? snap.segmentation.mean.toFixed(1) : '—'} ms  longtasks ${snap.longTasksPerSec.toFixed(2)}/s`,
          )
        }
      }
    }
  }

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  if (errors.length) console.log('\nОшибки страницы:\n' + errors.join('\n'))
} finally {
  await browser.close()
  vite?.kill()
}

// Сводка: среднее по повторам
const groups = new Map()
for (const r of rows) {
  const key = `${r.mode}|${r.thr}|${r.scenario}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(r)
}
const mean = (list, pick) => {
  const values = list.map(pick).filter((v) => typeof v === 'number' && Number.isFinite(v))
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN
}
console.log('\nmode thr scen | main CPU % | effect % | out fps | frame ms mean/p95 | seg ms mean | long tasks /s | rAF p95 ms | preset')
for (const [key, list] of groups) {
  const [mode, thr, scenario] = key.split('|')
  console.log(
    [
      `${mode} x${thr} ${scenario}`,
      mean(list, (r) => r.mainCpuPct).toFixed(0),
      mean(list, (r) => r.effectBusyPct).toFixed(1),
      mean(list, (r) => r.outFps).toFixed(1),
      `${mean(list, (r) => r.frame?.mean).toFixed(1)}/${mean(list, (r) => r.frame?.p95).toFixed(1)}`,
      mean(list, (r) => r.segmentation?.mean).toFixed(1),
      mean(list, (r) => r.longTasksPerSec).toFixed(2),
      mean(list, (r) => r.raf?.p95).toFixed(1),
      [...new Set(list.map((r) => r.preset))].join(','),
    ].join(' | '),
  )
}

if (env.OUT) {
  fs.writeFileSync(env.OUT, JSON.stringify({ headless: HEADLESS, rows }, null, 1))
  console.log(`\nJSON: ${env.OUT}`)
}
