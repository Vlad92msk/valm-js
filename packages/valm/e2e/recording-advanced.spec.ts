import { test, expect } from '@playwright/test'
import { gotoFixture, newInitializedValm, destroyValm } from './helpers/setup'

// Доп. контракты записи, не покрытые recording.spec.ts: поведение паузы,
// лимит по размеру файла (потенциальная гонка двойного stopRecording),
// blob-утилиты (getFileExtension / saveToIndexedDB / uploadBlob), autoSave и
// graceful-старт без активных треков.

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('duration не растёт на паузе и возобновляется после resume', async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    await rec.startRecording()
    await new Promise((r) => setTimeout(r, 400))

    rec.pauseRecording()
    const dPause1 = rec.state.duration
    await new Promise((r) => setTimeout(r, 400))
    const dPause2 = rec.state.duration // не должен вырасти на паузе

    rec.resumeRecording()
    await new Promise((r) => setTimeout(r, 400))
    const dResume = rec.state.duration // должен снова расти

    await rec.stopRecording()
    return { dPause1, dPause2, dResume }
  })

  // на паузе duration заморожен (допускаем джиттер до 50мс)
  expect(Math.abs(result.dPause2 - result.dPause1)).toBeLessThan(50)
  // после resume снова растёт
  expect(result.dResume).toBeGreaterThan(result.dPause2 + 200)
})

test('maxFileSize вызывает onRecordingLimitReached ровно один раз, без ошибок страницы', async ({ page }) => {
  await gotoFixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    const limits: Array<{ type: string; limit: number }> = []
    rec.onRecordingLimitReached((d: any) => limits.push(d))

    // очень маленький лимит (≈10 КБ) — превышается на первом же чанке видео
    await rec.startRecording({ maxFileSize: 0.01, chunkInterval: 500 })
    // ждём достаточно, чтобы прилетело несколько чанков (проверяем отсутствие повторов)
    await new Promise((r) => setTimeout(r, 2500))

    return {
      limits,
      isRecording: rec.state.isRecording,
    }
  })

  // лимит по размеру сработал
  expect(result.limits.length).toBeGreaterThanOrEqual(1)
  expect(result.limits[0].type).toBe('fileSize')
  // и НЕ продублировался (иначе — гонка повторного stopRecording в dataavailable)
  expect(result.limits.length).toBe(1)
  // запись остановилась
  expect(result.isRecording).toBe(false)
  // никаких необработанных исключений (InvalidStateError от повторного recorder.stop())
  expect(pageErrors).toEqual([])
})

test('getFileExtension маппит mime во все поддерживаемые расширения', async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const ext = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    // получаем utils через onRecordingStopped
    let utils: any = null
    rec.onRecordingStopped((_blob: Blob, u: any) => (utils = u))
    await rec.startRecording()
    await new Promise((r) => setTimeout(r, 300))
    await rec.stopRecording()

    return {
      webm: utils.getFileExtension('video/webm;codecs=vp9,opus'),
      mp4: utils.getFileExtension('video/mp4;codecs=h264,aac'),
      mkv: utils.getFileExtension('video/x-matroska;codecs=vp9,opus'),
      audioWebm: utils.getFileExtension('audio/webm;codecs=opus'),
      unknown: utils.getFileExtension('application/octet-stream'),
    }
  })

  expect(ext.webm).toBe('webm')
  expect(ext.mp4).toBe('mp4')
  expect(ext.mkv).toBe('mkv')
  expect(ext.audioWebm).toBe('webm')
  expect(ext.unknown).toBe('webm') // дефолт для неизвестного mime
})

test('saveToIndexedDB → чтение из IndexedDB даёт blob того же размера', async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    let utils: any = null
    let blobSize = 0
    rec.onRecordingStopped((blob: Blob, u: any) => {
      utils = u
      blobSize = blob.size
    })
    await rec.startRecording()
    await new Promise((r) => setTimeout(r, 500))
    const blob = await rec.stopRecording()

    await utils.saveToIndexedDB(blob, 'test-key')

    // читаем обратно
    const readBack: number = await new Promise((resolve, reject) => {
      const req = indexedDB.open('recordings', 1)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['files'], 'readonly')
        const store = tx.objectStore('files')
        const getReq = store.get('test-key')
        getReq.onsuccess = () => resolve((getReq.result as Blob)?.size ?? -1)
        getReq.onerror = () => reject(getReq.error)
      }
      req.onerror = () => reject(req.error)
    })

    return { blobSize, readBack }
  })

  expect(result.blobSize).toBeGreaterThan(0)
  expect(result.readBack).toBe(result.blobSize) // roundtrip идентичен по размеру
})

test('uploadBlob шлёт POST multipart на эндпоинт', async ({ page }) => {
  await gotoFixture(page)
  // мокаем эндпоинт загрузки
  await page.route('**/upload', async (route) => {
    const req = route.request()
    await route.fulfill({ status: 200, body: JSON.stringify({ ok: true, method: req.method() }) })
  })
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    let utils: any = null
    rec.onRecordingStopped((_blob: Blob, u: any) => (utils = u))
    await rec.startRecording()
    await new Promise((r) => setTimeout(r, 400))
    const blob = await rec.stopRecording()

    const res = await utils.uploadBlob(blob, '/upload')
    const body = await res.json()
    return { status: res.status, ok: res.ok, method: body.method }
  })

  expect(result.status).toBe(200)
  expect(result.ok).toBe(true)
  expect(result.method).toBe('POST')
})

test('autoSave:true инициирует скачивание при остановке записи', async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, {
    video: { enabled: true },
    audio: { enabled: true },
    recording: { autoSave: true },
  })

  const downloadPromise = page.waitForEvent('download', { timeout: 8000 })
  await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    await rec.startRecording()
    await new Promise((r) => setTimeout(r, 500))
    await rec.stopRecording()
  })

  const download = await downloadPromise
  // имя файла сгенерировано с корректным расширением
  expect(download.suggestedFilename()).toMatch(/^recording-.*\.(webm|mp4|mkv)$/)
})

test('старт записи без активных треков завершается graceful-ошибкой, не крашит', async ({ page }) => {
  await gotoFixture(page)
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // камера и микрофон выключены → в потоке нет дорожек
  await newInitializedValm(page, { video: { enabled: false }, audio: { enabled: false } })

  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    let recordingError: any = null
    rec.onError((e: any) => (recordingError = e))
    let threw = false
    try {
      await rec.startRecording()
      // дать возможному recorder'у поработать
      await new Promise((r) => setTimeout(r, 200))
    } catch {
      threw = true
    }
    return { threw, gotError: recordingError !== null, isRecording: rec.state.isRecording }
  })

  // либо reject, либо recordingError — но без падения страницы
  expect(result.threw || result.gotError).toBe(true)
  expect(result.isRecording).toBe(false)
  expect(pageErrors).toEqual([])
})
