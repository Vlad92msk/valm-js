import { DeviceDetector } from '../../utils'

export interface AudioOutputState {
  // Фактически применённый вывод ('default' — системный)
  deviceId: string
  // Выбранный пользователем вывод (null — системный); сохраняется, пока устройство отключено
  preferredDeviceId: string | null
  // Выбранный вывод пропал, звук идёт в системный
  isFallback: boolean
}

export interface AudioOutputErrorEvent {
  action: 'setOutputDevice' | 'registerAudioElement'
  deviceId: string
  error: unknown
}

type AudioOutputChangeCallback = (state: AudioOutputState) => void

type SinkTarget = { setSinkId(id: string): Promise<void> }

// По спецификации системный вывод задаётся пустой строкой; Firefox/Safari не понимают 'default'
const toSinkId = (deviceId: string | null) => (!deviceId || deviceId === 'default' ? '' : deviceId)

const hasSetSinkId = (el: unknown): el is SinkTarget => !!el && typeof (el as SinkTarget).setSinkId === 'function'

export class AudioOutputController {
  private state: AudioOutputState = {
    deviceId: 'default',
    preferredDeviceId: null,
    isFallback: false,
  }

  private callbacks = new Set<AudioOutputChangeCallback>()
  private errorCallbacks = new Set<(event: AudioOutputErrorEvent) => void>()
  private deviceLostCallbacks = new Set<(event: { deviceId: string }) => void>()
  private availableDevices: MediaDeviceInfo[] = []
  private registeredElements = new Set<HTMLAudioElement | HTMLVideoElement>()

  registerAudioElement = (element: HTMLAudioElement | HTMLVideoElement): VoidFunction => {
    this.registeredElements.add(element)

    if (this.state.deviceId !== 'default' && hasSetSinkId(element)) {
      element.setSinkId(toSinkId(this.state.deviceId)).catch((error) => {
        this._notifyError({ action: 'registerAudioElement', deviceId: this.state.deviceId, error })
      })
    }

    return () => {
      this.registeredElements.delete(element)
    }
  }

  // Список выводов (из DevicesController на devicechange); отслеживает пропажу и возврат выбранного sink
  setAvailableDevices(devices: MediaDeviceInfo[]): void {
    this.availableDevices = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== '')

    const preferred = this.state.preferredDeviceId
    if (!preferred || this.availableDevices.length === 0) return

    const present = this.availableDevices.some((d) => d.deviceId === preferred)

    if (!present && !this.state.isFallback) {
      // Chrome уже сам увёл звук в системный вывод — приводим state и элементы в соответствие
      this.state = { ...this.state, deviceId: 'default', isFallback: true }
      void this.applyToRegisteredElements('default')
      this.deviceLostCallbacks.forEach((cb) => cb({ deviceId: preferred }))
      this._notifyState()
    } else if (present && this.state.isFallback) {
      void this.applyToRegisteredElements(preferred).then(() => {
        this.state = { ...this.state, deviceId: preferred, isFallback: false }
        this._notifyState()
      })
    }
  }

  // null | 'default' — системный вывод. Возвращает false, если вывод не применён
  // (неизвестный id или setSinkId отказал у всех элементов); причина уходит в onError
  setOutputDevice = async (deviceId: string | null): Promise<boolean> => {
    const target = deviceId && deviceId !== 'default' ? deviceId : 'default'

    if (target !== 'default') {
      if (this.availableDevices.length === 0) await this.refreshDevices()

      if (!this.availableDevices.some((device) => device.deviceId === target)) {
        this._notifyError({ action: 'setOutputDevice', deviceId: target, error: new DOMException(`Audio output "${target}" not found`, 'NotFoundError') })
        return false
      }
    }

    // Сначала применяем, потом фиксируем state
    const { total, failed } = await this.applyToRegisteredElements(target)
    if (total > 0 && failed.length === total) {
      this._notifyError({ action: 'setOutputDevice', deviceId: target, error: failed[0] })
      return false
    }
    if (failed.length > 0) {
      this._notifyError({ action: 'setOutputDevice', deviceId: target, error: failed[0] })
    }

    this.state = { deviceId: target, preferredDeviceId: target === 'default' ? null : target, isFallback: false }
    this._notifyState()
    return true
  }

  // Тихий enumerateDevices (без запроса разрешений) — если список ещё не получали
  private async refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.()
      if (devices) this.availableDevices = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== '')
    } catch {
      // оставляем пустой список
    }
  }

  private async applyToRegisteredElements(deviceId: string): Promise<{ total: number; failed: unknown[] }> {
    const promises: Promise<void>[] = []

    this.registeredElements.forEach((element) => {
      if (hasSetSinkId(element)) {
        promises.push(element.setSinkId(toSinkId(deviceId)))
      }
    })

    const results = await Promise.allSettled(promises)
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason)
    return { total: promises.length, failed }
  }

  // Только устройство с «speaker»-подобным названием; без совпадения ничего не выбираем
  private findSpeakerphone(): MediaDeviceInfo | null {
    return (
      this.availableDevices.find((device) => {
        const label = device.label.toLowerCase()
        return label.includes('speaker') || label.includes('loud') || label.includes('speakerphone') || label.includes('спикер') || label.includes('громкоговоритель')
      }) ?? null
    )
  }

  async autoSelectSpeakerphone(): Promise<boolean> {
    if (!DeviceDetector.isMobile()) {
      return false
    }

    if (typeof HTMLAudioElement.prototype.setSinkId === 'undefined') return false

    const speakerphone = this.findSpeakerphone()

    if (!speakerphone) return false

    try {
      return await this.setOutputDevice(speakerphone.deviceId)
    } catch (error) {
      console.error('[AudioOutputController] Failed to auto-select speakerphone:', error)
      return false
    }
  }

  getOutputState(): AudioOutputState {
    return { ...this.state }
  }

  isOutputSelectionSupported(): boolean {
    return typeof HTMLAudioElement.prototype.setSinkId !== 'undefined'
  }

  onChange = (callback: AudioOutputChangeCallback): VoidFunction => {
    this.callbacks.add(callback)

    // Сразу вызываем колбэк с текущим состоянием
    callback(this.getOutputState())

    return () => this.callbacks.delete(callback)
  }

  onError = (callback: (event: AudioOutputErrorEvent) => void): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  // Выбранный вывод пропал из системы; звук переведён в системный (state.isFallback)
  onDeviceLost = (callback: (event: { deviceId: string }) => void): VoidFunction => {
    this.deviceLostCallbacks.add(callback)
    return () => this.deviceLostCallbacks.delete(callback)
  }

  private _notifyState(): void {
    const currentState = this.getOutputState()
    this.callbacks.forEach((cb) => cb(currentState))
  }

  private _notifyError(event: AudioOutputErrorEvent): void {
    this.errorCallbacks.forEach((cb) => cb(event))
  }

  // Проигрывает тестовый звук (файл по url или тон 440Hz)
  async playTestSound(options?: { url?: string; duration?: number }): Promise<void> {
    const duration = options?.duration ?? 2

    if (options?.url) {
      return this.playTestSoundFromUrl(options.url, duration)
    }

    return this.playGeneratedTone(duration)
  }

  private async playTestSoundFromUrl(url: string, duration: number): Promise<void> {
    const audio = new Audio(url)

    if (this.state.deviceId !== 'default' && hasSetSinkId(audio)) {
      await audio.setSinkId(toSinkId(this.state.deviceId))
    }

    await audio.play()

    return new Promise<void>((resolve) => {
      let resolved = false
      const cleanup = () => {
        if (resolved) return
        resolved = true
        audio.pause()
        audio.src = ''
        resolve()
      }
      audio.addEventListener('ended', cleanup, { once: true })
      setTimeout(cleanup, duration * 1000)
    })
  }

  private async playGeneratedTone(duration: number): Promise<void> {
    const audioContext = new AudioContext()

    // Направляем звук на выбранное устройство вывода (если поддерживается)
    if (this.state.deviceId !== 'default' && hasSetSinkId(audioContext)) {
      await audioContext.setSinkId(toSinkId(this.state.deviceId))
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime)
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)

    // Плавное затухание в конце
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + duration - 0.1)
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start()
    oscillator.stop(audioContext.currentTime + duration)

    return new Promise<void>((resolve) => {
      oscillator.addEventListener('ended', () => {
        audioContext.close()
        resolve()
      }, { once: true })
    })
  }

  destroy(): void {
    this.callbacks.clear()
    this.errorCallbacks.clear()
    this.deviceLostCallbacks.clear()
    this.availableDevices = []
    this.registeredElements.clear()
  }
}
