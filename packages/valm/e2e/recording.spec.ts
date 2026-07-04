import { test, expect } from '@playwright/test'
import { gotoFixture, newInitializedValm, destroyValm } from './helpers/setup'

// Контракты из guides/recording.md.
// Инициализируем реальные video+audio треки, чтобы MediaRecorder писал реальный поток.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newInitializedValm(page, { video: { enabled: true }, audio: { enabled: true } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('полный цикл start → pause → resume → stop отдаёт непустой Blob корректного mime', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    await rec.startRecording({ autoSave: false, includeVideo: true, includeAudio: true })
    const afterStart = { isRecording: rec.state.isRecording, format: rec.state.format }

    await new Promise((r) => setTimeout(r, 300))
    rec.pauseRecording()
    const afterPause = { isPaused: rec.state.isPaused }

    rec.resumeRecording()
    const afterResume = { isPaused: rec.state.isPaused, isRecording: rec.state.isRecording }

    await new Promise((r) => setTimeout(r, 300))
    const blob = await rec.stopRecording()
    return {
      afterStart,
      afterPause,
      afterResume,
      blobSize: blob.size,
      blobType: blob.type,
      isRecordingAfterStop: rec.state.isRecording,
    }
  })

  expect(result.afterStart.isRecording).toBe(true)
  expect(result.afterStart.format).toContain('video/')
  expect(result.afterPause.isPaused).toBe(true)
  expect(result.afterResume.isPaused).toBe(false)
  expect(result.afterResume.isRecording).toBe(true)
  expect(result.blobSize).toBeGreaterThan(0)
  expect(result.blobType).toContain('video/webm')
  expect(result.isRecordingAfterStop).toBe(false)
})

test('onRecordingData шлёт чанки во время записи', async ({ page }) => {
  const chunks = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    const received: Array<{ chunkSize: number; totalSize: number; duration: number }> = []
    rec.onRecordingData((d: any) => received.push({ chunkSize: d.chunk.size, totalSize: d.totalSize, duration: d.duration }))
    await rec.startRecording({ autoSave: false, chunkInterval: 200 })
    await new Promise((r) => setTimeout(r, 900))
    await rec.stopRecording()
    return received
  })

  expect(chunks.length).toBeGreaterThan(0)
  expect(chunks[0]).toHaveProperty('chunk' in chunks[0] ? 'chunk' : 'chunkSize')
  expect(chunks[0].totalSize).toBeGreaterThan(0)
  expect(typeof chunks[0].duration).toBe('number')
})

test('onRecordingStopped передаёт Blob и утилиты (createObjectURL, getFileExtension)', async ({ page }) => {
  const info = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    const result: any = {}
    rec.onRecordingStopped((blob: Blob, utils: any) => {
      result.blobSize = blob.size
      result.blobType = blob.type
      result.hasDownload = typeof utils.downloadBlob === 'function'
      result.hasUpload = typeof utils.uploadBlob === 'function'
      result.hasSaveIdb = typeof utils.saveToIndexedDB === 'function'
      const url = utils.createObjectURL(blob)
      result.urlIsBlob = url.startsWith('blob:')
      URL.revokeObjectURL(url)
      result.ext = utils.getFileExtension(blob.type)
    })
    await rec.startRecording({ autoSave: false })
    await new Promise((r) => setTimeout(r, 300))
    await rec.stopRecording()
    // дать onRecordingStopped отработать
    await new Promise((r) => setTimeout(r, 50))
    return result
  })

  expect(info.blobSize).toBeGreaterThan(0)
  expect(info.hasDownload).toBe(true)
  expect(info.hasUpload).toBe(true)
  expect(info.hasSaveIdb).toBe(true)
  expect(info.urlIsBlob).toBe(true)
  expect(['webm', 'mp4', 'mkv']).toContain(info.ext)
})

test('maxDuration останавливает запись и шлёт onRecordingLimitReached(type=duration)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    let limit: any = null
    rec.onRecordingLimitReached((d: any) => (limit = d))
    await rec.startRecording({ autoSave: false, maxDuration: 1 }) // 1 секунда
    // ждём срабатывания лимита (+ запас)
    await new Promise((r) => setTimeout(r, 2500))
    return { limit, isRecording: rec.state.isRecording }
  })

  expect(result.limit).not.toBeNull()
  expect(result.limit.type).toBe('duration')
  expect(result.limit.limit).toBe(1)
  expect(result.isRecording).toBe(false)
})

test('state.quality отражает выбранный пресет', async ({ page }) => {
  const quality = await page.evaluate(async () => {
    const rec = window.__valm.recordingController
    await rec.startRecording({ autoSave: false, quality: 'high' })
    const q = rec.state.quality
    await rec.stopRecording()
    return q
  })
  expect(quality).toBe('high')
})
