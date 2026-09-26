import { test, expect, type Page } from '@playwright/test'
import { gotoFixture, newValm, destroyValm } from './helpers/setup'

// Устойчивость к смене/пропаже устройств: deviceFallback, SwitchResult, force/reacquire,
// defaults и onDeviceDisconnected, onDefaultDeviceChanged, source-mute, onTrackEnded, audio output.
// См. VALM_ISSUES_FROM_MEET_CLIENT.md (#1, #2, #4, #7, #8, N2, N4, N5, N7).

test.afterEach(async ({ page }) => {
  await destroyValm(page)
})

// gUM-мок: 'gone' → OverconstrainedError(deviceId), 'busy' → NotReadableError,
// любой другой id открывает устройство по умолчанию
async function mockGetUserMedia(page: Page) {
  await page.evaluate(() => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    ;(window as any).__gumCalls = 0
    navigator.mediaDevices.getUserMedia = async (c: any) => {
      ;(window as any).__gumCalls++
      const id = c?.audio?.deviceId?.exact ?? c?.video?.deviceId?.exact
      if (id === 'gone') {
        const e: any = new Error('overconstrained')
        e.name = 'OverconstrainedError'
        e.constraint = 'deviceId'
        throw e
      }
      if (id === 'busy') throw new DOMException('busy', 'NotReadableError')
      const strip = (x: any) => (x && typeof x === 'object' ? { ...x, deviceId: undefined } : x)
      return orig({ audio: strip(c?.audio), video: strip(c?.video) })
    }
  })
}

// enumerateDevices-мок: список задаётся из теста через window.__devices
async function mockEnumerateDevices(page: Page, devices: Array<{ kind: string; deviceId: string; groupId: string; label: string }>) {
  await page.evaluate((list) => {
    ;(window as any).__devices = list
    navigator.mediaDevices.enumerateDevices = async () =>
      (window as any).__devices.map((d: any) => ({ ...d, toJSON: () => d })) as MediaDeviceInfo[]
  }, devices)
}

const rawAudioTrack = () => window.__valm.mediaStreamService.getAudioTrackManagerService().getRawTrack()

test.describe('микрофон', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFixture(page)
  })

  test('#2 deviceFallback: "default" — пропавший микрофон заменяется системным с событием; "none" — ошибка', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, deviceId: 'gone', deviceFallback: 'default' } })
    await mockGetUserMedia(page)

    const withFallback = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      const events: any[] = []
      mic.onDeviceFallback((e: any) => events.push(e))
      await mic.enable()
      return { enabled: mic.state.isEnabled, events, preferred: mic.getConfiguration().deviceId }
    })
    expect(withFallback.enabled).toBe(true)
    expect(withFallback.events).toHaveLength(1)
    expect(withFallback.events[0]).toMatchObject({ requestedDeviceId: 'gone', reason: 'overconstrained' })
    // предпочтение сохраняется — к нему вернёмся, когда устройство появится
    expect(withFallback.preferred).toBe('gone')

    const withoutFallback = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      mic.disable()
      window.__valm.mediaStreamService.configService.updateAudioConfig({ deviceFallback: 'none' })
      return mic.enable().then(() => 'ok', (e: any) => e.name)
    })
    expect(withoutFallback).toBe('OverconstrainedError')
  })

  test('#2 NotReadableError не вызывает fallback', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, deviceId: 'busy', deviceFallback: 'default' } })
    await mockGetUserMedia(page)
    const err = await page.evaluate(() => window.__valm.microphoneController.enable().then(() => null, (e: any) => e.name))
    expect(err).toBe('NotReadableError')
  })

  test('#3/N5 switchDevice возвращает SwitchResult: applied / noop / disabled / superseded', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    await mockGetUserMedia(page)

    const r = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      const disabled = await mic.switchDevice('a')
      await mic.enable()
      const applied = await mic.switchDevice('b')
      const [first, second] = await Promise.all([mic.switchDevice('c'), mic.switchDevice('d')])
      return { disabled, applied, first, second }
    })
    expect(r.disabled).toEqual({ applied: false, deviceId: 'a', reason: 'disabled' })
    expect(r.applied).toEqual({ applied: true, deviceId: 'b' })
    expect(r.first).toEqual({ applied: false, deviceId: 'c', reason: 'superseded' })
    expect(r.second).toEqual({ applied: true, deviceId: 'd' })
  })

  test('#4 reacquire()/force переоткрывает текущее устройство и сохраняет mute', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      await mic.enable()
      const before = mic.getTrack()
      const noForce = await mic.switchDevice(null)
      await mic.toggleMute()
      const result = await mic.reacquire()
      const after = mic.getTrack()
      return { noForce, result, replaced: before !== after, enabled: after.enabled, isMuted: mic.state.isMuted }
    })
    expect(r.noForce).toMatchObject({ applied: false, reason: 'noop' })
    expect(r.result).toMatchObject({ applied: true })
    expect(r.replaced).toBe(true)
    expect(r.enabled).toBe(false)
    expect(r.isMuted).toBe(true)
  })

  test('N8 enable(id) при включённом микрофоне делает одно переключение', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    await mockGetUserMedia(page)
    const calls = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      await mic.enable()
      ;(window as any).__gumCalls = 0
      await mic.enable('other')
      await new Promise((r) => setTimeout(r, 100))
      return (window as any).__gumCalls
    })
    expect(calls).toBe(1)
  })

  test('#8 onSourceMuteChange и state.isSourceMuted — в том числе при включённом аудио-графе', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async (rawTrackSrc) => {
      const getRaw = new Function(`return (${rawTrackSrc})()`) as () => MediaStreamTrack
      const mic = window.__valm.microphoneController
      await mic.enable()
      mic.setGain(1)
      await new Promise((res) => setTimeout(res, 200))
      const events: boolean[] = []
      mic.onSourceMuteChange((e: any) => events.push(e.muted))

      const raw = getRaw()
      const graphActive = raw !== mic.getTrack()
      Object.defineProperty(raw, 'muted', { configurable: true, get: () => true })
      raw.dispatchEvent(new Event('mute'))
      const mutedState = mic.state.isSourceMuted
      Object.defineProperty(raw, 'muted', { configurable: true, get: () => false })
      raw.dispatchEvent(new Event('unmute'))
      return { graphActive, events, mutedState, unmutedState: mic.state.isSourceMuted }
    }, rawAudioTrack.toString())
    expect(r.graphActive).toBe(true)
    expect(r.events).toEqual([true, false])
    expect(r.mutedState).toBe(true)
    expect(r.unmutedState).toBe(false)
  })

  test('sourceMuteDebounceMs: короткое «мигание» mute не сообщается, длинное — сообщается', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, sourceMuteDebounceMs: 150 } })
    const r = await page.evaluate(async (rawTrackSrc) => {
      const getRaw = new Function(`return (${rawTrackSrc})()`) as () => MediaStreamTrack
      const mic = window.__valm.microphoneController
      await mic.enable()
      const events: boolean[] = []
      mic.onSourceMuteChange((e: any) => events.push(e.muted))
      const raw = getRaw()
      const setMuted = (m: boolean) => {
        Object.defineProperty(raw, 'muted', { configurable: true, get: () => m })
        raw.dispatchEvent(new Event(m ? 'mute' : 'unmute'))
      }
      setMuted(true)
      await new Promise((res) => setTimeout(res, 50))
      setMuted(false)
      const afterBlip = [...events]
      setMuted(true)
      const stateBeforeDelay = mic.state.isSourceMuted
      await new Promise((res) => setTimeout(res, 250))
      return { afterBlip, stateBeforeDelay, events, state: mic.state.isSourceMuted }
    }, rawAudioTrack.toString())
    expect(r.afterBlip).toEqual([])
    expect(r.stateBeforeDelay).toBe(false)
    expect(r.events).toEqual([true])
    expect(r.state).toBe(true)
  })

  test('onTrackReplaced несёт isMuted', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async () => {
      const mic = window.__valm.microphoneController
      await mic.enable()
      await mic.toggleMute()
      const event = new Promise<any>((res) => mic.onTrackReplaced(res))
      await mic.reacquire()
      return (await event).isMuted
    })
    expect(r).toBe(true)
  })

  test('N2 onTrackEnded: reason "ended", если устройство на месте', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async (rawTrackSrc) => {
      const getRaw = new Function(`return (${rawTrackSrc})()`) as () => MediaStreamTrack
      const mic = window.__valm.microphoneController
      await mic.enable()
      const ended = new Promise<any>((res) => mic.onTrackEnded(res))
      getRaw().dispatchEvent(new Event('ended'))
      const event = await ended
      return { reason: event.reason, kind: event.kind, enabled: mic.state.isEnabled }
    }, rawAudioTrack.toString())
    expect(r).toEqual({ reason: 'ended', kind: 'audio', enabled: false })
  })

  test('N2 + #2 пропажа устройства: reason "device-lost" и автовосстановление на системный', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, deviceFallback: 'default' } })
    const r = await page.evaluate(async (rawTrackSrc) => {
      const getRaw = new Function(`return (${rawTrackSrc})()`) as () => MediaStreamTrack
      const mic = window.__valm.microphoneController
      const real = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
      await mic.enable(real[0].deviceId)
      const raw = getRaw()

      // устройство пропадает из системы: enumerateDevices его больше не видит, gUM по нему падает
      const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
      navigator.mediaDevices.enumerateDevices = async () => (await origEnum()).filter((d) => d.groupId !== raw.getSettings().groupId)
      const origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (c: any) => {
        if (c?.audio?.deviceId?.exact === real[0].deviceId) {
          const e: any = new Error('gone')
          e.name = 'OverconstrainedError'
          e.constraint = 'deviceId'
          throw e
        }
        return origGum(c)
      }

      const ended = new Promise<any>((res) => mic.onTrackEnded(res))
      const fallback = new Promise<any>((res) => mic.onDeviceFallback(res))
      raw.dispatchEvent(new Event('ended'))
      const endedEvent = await ended
      const fallbackEvent = await fallback
      await new Promise((res) => setTimeout(res, 100))
      return { reason: endedEvent.reason, fallbackReason: fallbackEvent.reason, enabled: mic.state.isEnabled, live: mic.getTrack()?.readyState }
    }, rawAudioTrack.toString())
    expect(r).toEqual({ reason: 'device-lost', fallbackReason: 'device-lost', enabled: true, live: 'live' })
  })
})

test.describe('устройства', () => {
  const physical = (id: string, groupId: string, kind = 'audioinput') => ({ kind, deviceId: id, groupId, label: `${kind} ${id}` })

  test.beforeEach(async ({ page }) => {
    await gotoFixture(page)
  })

  test('#1 state.defaults заполнен, массивы без "default"; getAvailable() не шлёт ложных onDeviceDisconnected', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async () => {
      const dc = window.__valm.devicesController
      const events: any[] = []
      dc.onDeviceDisconnected((e: any) => events.push(e))
      await window.__valm.microphoneController.enable() // трек на 'default'
      const state = await dc.getAvailable()
      await dc.getAvailable()
      await dc.getAvailable()
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'))
      await new Promise((res) => setTimeout(res, 200))
      return {
        events,
        hasDefaultMic: state.defaults.microphone?.deviceId === 'default',
        micsHaveDefault: state.microphones.some((d: any) => d.deviceId === 'default'),
      }
    })
    expect(r.events).toEqual([])
    expect(r.hasDefaultMic).toBe(true)
    expect(r.micsHaveDefault).toBe(false)
  })

  test('#1 onDeviceDisconnected — ровно один раз, даже если ended пришёл раньше devicechange', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
    const r = await page.evaluate(async (rawTrackSrc) => {
      const getRaw = new Function(`return (${rawTrackSrc})()`) as () => MediaStreamTrack
      const dc = window.__valm.devicesController
      const mic = window.__valm.microphoneController
      const real = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
      await mic.enable(real[0].deviceId)
      const id = getRaw().getSettings().deviceId

      const events: any[] = []
      dc.onDeviceDisconnected((e: any) => events.push(e))
      const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
      navigator.mediaDevices.enumerateDevices = async () => (await origEnum()).filter((d) => d.deviceId !== id)

      getRaw().dispatchEvent(new Event('ended'))
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'))
      await new Promise((res) => setTimeout(res, 100))
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'))
      await new Promise((res) => setTimeout(res, 100))
      return { events, id }
    }, rawAudioTrack.toString())
    expect(r.events).toEqual([{ kind: 'microphone', deviceId: r.id }])
  })

  test('#4 onDefaultDeviceChanged + followSystemDefault переоткрывает микрофон', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, followSystemDefault: true } })
    await mockEnumerateDevices(page, [
      { kind: 'audioinput', deviceId: 'default', groupId: 'g1', label: 'Default - Built-in' },
      physical('built-in', 'g1'),
      physical('airpods', 'g2'),
    ])
    const r = await page.evaluate(async () => {
      const v = window.__valm
      await v.devicesController.getAvailable()
      await v.microphoneController.enable()
      const before = v.microphoneController.getTrack()
      const changes: any[] = []
      v.devicesController.onDefaultDeviceChanged((e: any) => changes.push({ kind: e.kind, prev: e.previous?.groupId, cur: e.current?.groupId }))
      const replaced = new Promise<void>((res) => v.microphoneController.onTrackReplaced(() => res()))

      ;(window as any).__devices[0] = { kind: 'audioinput', deviceId: 'default', groupId: 'g2', label: 'Default - AirPods' }
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'))
      await replaced
      return { changes, replaced: v.microphoneController.getTrack() !== before }
    })
    expect(r.changes).toEqual([{ kind: 'microphone', prev: 'g1', cur: 'g2' }])
    expect(r.replaced).toBe(true)
  })

  test('N4 ошибка микрофона не попадает в camera.onError', async ({ page }) => {
    await newValm(page, { video: { enabled: false }, audio: { enabled: false, deviceId: 'busy' } })
    await mockGetUserMedia(page)
    const r = await page.evaluate(async () => {
      const cameraErrors: any[] = []
      const micErrors: any[] = []
      window.__valm.cameraController.onError((e: any) => cameraErrors.push(e))
      window.__valm.microphoneController.onError((e: any) => micErrors.push(e))
      await window.__valm.microphoneController.enable().catch(() => {})
      return { camera: cameraErrors.length, mic: micErrors.length }
    })
    expect(r.camera).toBe(0)
    expect(r.mic).toBeGreaterThan(0)
  })
})

test.describe('камера', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFixture(page)
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  })

  test('#2 камера: deviceFallback "default" открывает системную камеру', async ({ page }) => {
    await mockGetUserMedia(page)
    const r = await page.evaluate(async () => {
      const v = window.__valm
      v.mediaStreamService.configService.updateVideoConfig({ deviceFallback: 'default' })
      const events: any[] = []
      v.cameraController.onDeviceFallback((e: any) => events.push(e))
      await v.cameraController.enable('gone')
      return { enabled: v.cameraController.state.isEnabled, events: events.length }
    })
    expect(r).toEqual({ enabled: true, events: 1 })
  })

  test('N7 mute видео переживает включение и выключение эффекта', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const v = window.__valm
      v.use(new window.Effects.EffectsPlugin())
      await v.cameraController.enable()
      v.mediaStreamService.muteVideo()
      await v.effectsController.enableBlur()
      await new Promise((res) => setTimeout(res, 300))
      const withEffect = v.cameraController.getTrack()?.enabled
      v.effectsController.disableBlur?.() ?? v.effectsController.removeEffect('background-blur')
      await new Promise((res) => setTimeout(res, 300))
      const withoutEffect = v.cameraController.getTrack()?.enabled
      return { withEffect, withoutEffect, isMuted: v.cameraController.state.isMuted }
    })
    expect(r).toEqual({ withEffect: false, withoutEffect: false, isMuted: true })
  })
})

test.describe('вывод звука', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFixture(page)
    await page.evaluate(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    })
    await newValm(page, { video: { enabled: false }, audio: { enabled: false } })
  })

  test('#7 неизвестный id → false + onError, state не меняется (и при пустом кэше)', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const ao = window.__valm.audioOutputController
      const errors: any[] = []
      ao.onError((e: any) => errors.push(e.deviceId))
      const changes: any[] = []
      ao.onChange((s: any) => changes.push(s.deviceId))
      const result = await ao.setOutputDevice('nonexistent')
      return { result, errors, state: ao.getOutputState(), changes }
    })
    expect(r.result).toBe(false)
    expect(r.errors).toEqual(['nonexistent'])
    expect(r.state).toEqual({ deviceId: 'default', preferredDeviceId: null, isFallback: false })
    expect(r.changes).toEqual(['default']) // только немедленный вызов onChange
  })

  test('#7 "default" передаётся в setSinkId как пустая строка', async ({ page }) => {
    const sink = await page.evaluate(async () => {
      const ao = window.__valm.audioOutputController
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
      ao.setAvailableDevices(outs)
      const audio = document.createElement('audio')
      ao.registerAudioElement(audio)
      await ao.setOutputDevice(outs[0].deviceId)
      await ao.setOutputDevice('default')
      return (audio as any).sinkId
    })
    expect(sink).toBe('')
  })

  test('#7 setSinkId отказал у всех элементов → false, state прежний', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const ao = window.__valm.audioOutputController
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
      ao.setAvailableDevices(outs)
      const audio: any = document.createElement('audio')
      audio.setSinkId = () => Promise.reject(new DOMException('nope', 'NotAllowedError'))
      ao.registerAudioElement(audio)
      const result = await ao.setOutputDevice(outs[0].deviceId)
      return { result, deviceId: ao.getOutputState().deviceId }
    })
    expect(r).toEqual({ result: false, deviceId: 'default' })
  })

  test('#7 выбранный вывод пропал → isFallback + onDeviceLost; вернулся → восстановлен', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const ao = window.__valm.audioOutputController
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
      ao.setAvailableDevices(outs)
      const target = outs[0].deviceId
      await ao.setOutputDevice(target)

      const lost: any[] = []
      ao.onDeviceLost((e: any) => lost.push(e.deviceId))
      ao.setAvailableDevices(outs.slice(1))
      const afterLoss = ao.getOutputState()
      ao.setAvailableDevices(outs)
      await new Promise((res) => setTimeout(res, 50))
      return { target, lost, afterLoss, afterRestore: ao.getOutputState() }
    })
    expect(r.lost).toEqual([r.target])
    expect(r.afterLoss).toEqual({ deviceId: 'default', preferredDeviceId: r.target, isFallback: true })
    expect(r.afterRestore).toEqual({ deviceId: r.target, preferredDeviceId: r.target, isFallback: false })
  })
})
