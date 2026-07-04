import { test, expect } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// AudioOutputController: выбор устройства вывода (setSinkId), регистрация элементов
// с авто-переключением sink, onChange, playTestSound без утечки AudioContext.

test.beforeEach(async ({ page }) => {
  await gotoFixture(page)
  // грант доступа, чтобы enumerateDevices отдал реальные audiooutput с deviceId/label
  await page.evaluate(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach((t) => t.stop())
  })
  await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
})

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

test('дефолтное состояние — default, onChange сразу отдаёт текущее состояние', async ({ page }) => {
  const result = await page.evaluate(() => {
    const ao = window.__valm.audioOutputController
    let immediate: any = null
    ao.onChange((s: any) => (immediate = immediate ?? s))
    return { state: ao.getOutputState(), immediate }
  })
  expect(result.state.deviceId).toBe('default')
  expect(result.immediate.deviceId).toBe('default') // onChange вызывается немедленно
})

test('setOutputDevice() переключает sink зарегистрированного элемента и шлёт onChange', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ao = window.__valm.audioOutputController
    const devs = await navigator.mediaDevices.enumerateDevices()
    const outs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
    ao.setAvailableDevices(devs)

    const audio = document.createElement('audio')
    document.body.appendChild(audio)
    ao.registerAudioElement(audio)

    const changes: string[] = []
    ao.onChange((s: any) => changes.push(s.deviceId))

    const target = outs[0].deviceId
    await ao.setOutputDevice(target)

    return {
      target,
      stateDeviceId: ao.getOutputState().deviceId,
      elementSinkId: (audio as any).sinkId,
      // changes[0] — немедленный вызов onChange (default), последний — после переключения
      lastChange: changes[changes.length - 1],
    }
  })

  expect(result.stateDeviceId).toBe(result.target)
  expect(result.elementSinkId).toBe(result.target) // sink реально применился к элементу
  expect(result.lastChange).toBe(result.target)
})

test('registerAudioElement сразу применяет уже выбранный sink, unregister отписывает', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ao = window.__valm.audioOutputController
    const devs = await navigator.mediaDevices.enumerateDevices()
    const outs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
    ao.setAvailableDevices(devs)

    // сначала выбираем устройство (без зарегистрированных элементов)
    await ao.setOutputDevice(outs[0].deviceId)

    // теперь регистрируем элемент — он должен сразу получить выбранный sink
    const audio = document.createElement('audio')
    document.body.appendChild(audio)
    const unregister = ao.registerAudioElement(audio)
    // setSinkId в register асинхронный (catch), дадим микротаску
    await new Promise((r) => setTimeout(r, 50))
    const sinkAfterRegister = (audio as any).sinkId

    // unregister → элемент больше не в наборе: смена устройства его не трогает
    unregister()
    await ao.setOutputDevice(outs[1].deviceId)
    await new Promise((r) => setTimeout(r, 50))
    const sinkAfterUnregister = (audio as any).sinkId

    return { expected0: outs[0].deviceId, expected1: outs[1].deviceId, sinkAfterRegister, sinkAfterUnregister }
  })

  expect(result.sinkAfterRegister).toBe(result.expected0) // авто-применение при регистрации
  // после unregister смена устройства не должна перекинуть sink элемента
  expect(result.sinkAfterUnregister).toBe(result.expected0)
  expect(result.sinkAfterUnregister).not.toBe(result.expected1)
})

test('setOutputDevice() игнорирует несуществующее устройство (когда список известен)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const ao = window.__valm.audioOutputController
    const devs = await navigator.mediaDevices.enumerateDevices()
    ao.setAvailableDevices(devs)
    await ao.setOutputDevice('nonexistent-device-id-123')
    return ao.getOutputState().deviceId
  })
  // неизвестный id отвергнут — остаёмся на default
  expect(result).toBe('default')
})

test('playTestSound() проигрывает тон и закрывает AudioContext (без утечки)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // считаем создаваемые AudioContext
    ;(window as any).__ctx = []
    const Orig = window.AudioContext
    // @ts-expect-error — учёт инстансов
    window.AudioContext = class extends Orig {
      constructor(...args: any[]) {
        super(...args)
        ;(window as any).__ctx.push(this)
      }
    }

    const ao = window.__valm.audioOutputController
    await ao.playTestSound({ duration: 0.15 })
    // дать событию ended закрыть контекст
    await new Promise((r) => setTimeout(r, 100))

    const ctxs: AudioContext[] = (window as any).__ctx
    return { created: ctxs.length, open: ctxs.filter((c) => c.state !== 'closed').length }
  })

  expect(result.created).toBeGreaterThanOrEqual(1) // тон реально сгенерирован
  expect(result.open).toBe(0) // AudioContext закрыт после проигрывания
})
