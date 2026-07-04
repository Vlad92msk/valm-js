import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm, getState } from './helpers/setup'
import { inspectTrack } from './helpers/media'

// Доп. контракты камеры, не покрытые camera.spec.ts: мёрдж updateConstraints,
// реакция на внешнее завершение трека (выдёргивание устройства) и отсутствие утечки
// preview-трека при повторном preview().

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('updateConstraints() мёрджит частичные constraints, не затирая прежние', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.updateConstraints({ aspectRatio: 1.777 }))
  await page.evaluate(() => window.__valm.cameraController.updateConstraints({ facingMode: 'user' }))

  const constraints = await page.evaluate(() => window.__valm.cameraController.getConfiguration().constraints)
  // оба ключа присутствуют — второй вызов не выкинул первый
  expect(constraints.aspectRatio).toBe(1.777)
  expect(constraints.facingMode).toBe('user')
})

test('updateConstraints() на включённой камере перезапускает трек, оставляя его живым', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const before = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(before.readyState).toBe('live')

  await page.evaluate(() => window.__valm.cameraController.updateConstraints({ aspectRatio: 1.333 }))

  // после restart трек снова живой, камера всё ещё включена
  await expect
    .poll(async () => (await inspectTrack(page, 'window.__valm.cameraController.getTrack()')).readyState)
    .toBe('live')
  expect((await getState(page)).camera.isEnabled).toBe(true)
})

test('внешнее завершение трека (выдёргивание устройства) приводит состояние в консистентность', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  expect((await getState(page)).camera.isEnabled).toBe(true)

  // собираем videoStateChanged
  await page.evaluate(() => {
    window.__events = []
    window.__valm.on('videoStateChanged', () => window.__events.push('videoStateChanged'))
  })

  // Эмулируем выдёргивание устройства: ручной stop() НЕ диспатчит 'ended',
  // поэтому диспатчим событие сами (браузер делает это при реальном отключении).
  await page.evaluate(() => {
    const raw = window.__valm.mediaStreamService.getVideoTrackManager().getRawTrack()
    raw.stop()
    raw.dispatchEvent(new Event('ended'))
  })

  // состояние стало консистентным: камера выключена, трека нет
  await expect.poll(async () => (await getState(page)).camera.isEnabled).toBe(false)
  const track = await inspectTrack(page, 'window.__valm.cameraController.getTrack()')
  expect(track.exists).toBe(false)
  // приложение получило уведомление об изменении состояния видео
  expect(await page.evaluate(() => window.__events.length)).toBeGreaterThan(0)
})

test('повторный preview() глушит первый preview-трек (нет утечки)', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())

  const { first, second, distinct } = await page.evaluate(async () => {
    const t1 = await window.__valm.cameraController.preview()
    const t2 = await window.__valm.cameraController.preview()
    return {
      first: t1.readyState, // первый preview должен быть заглушён вторым
      second: t2.readyState,
      distinct: t1 !== t2,
    }
  })

  expect(distinct).toBe(true)
  expect(first).toBe('ended') // первый preview-трек не утёк
  expect(second).toBe('live')
  expect((await getState(page)).camera.isPreviewing).toBe(true)
  // основной трек камеры при этом не пострадал
  expect((await inspectTrack(page, 'window.__valm.cameraController.getTrack()')).readyState).toBe('live')
})

test('destroy() глушит незавершённый preview-трек', async ({ page }) => {
  await page.evaluate(() => window.__valm.cameraController.enable())
  const previewLive = await page.evaluate(async () => {
    const t = await window.__valm.cameraController.preview()
    ;(window as any).__prev = t
    return t.readyState
  })
  expect(previewLive).toBe('live')

  await page.evaluate(() => window.__valm.destroy())
  const after = await page.evaluate(() => (window as any).__prev.readyState)
  expect(after).toBe('ended') // preview-трек заглушён вместе с инстансом
})
