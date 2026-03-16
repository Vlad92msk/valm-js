import { DeviceDetector } from '../../utils/device-detector'

export interface AudioOutputState {
  deviceId: string
}

type AudioOutputChangeCallback = (state: AudioOutputState) => void

export class AudioOutputController {
  private state: AudioOutputState = {
    deviceId: 'default',
  }

  private callbacks = new Set<AudioOutputChangeCallback>()
  private availableDevices: MediaDeviceInfo[] = []
  private registeredElements = new Set<HTMLAudioElement | HTMLVideoElement>()

  registerAudioElement = (element: HTMLAudioElement | HTMLVideoElement): VoidFunction => {
    this.registeredElements.add(element)

    if (this.state.deviceId !== 'default' && 'setSinkId' in element && typeof element.setSinkId === 'function') {
      element.setSinkId(this.state.deviceId).catch(() => {})
    }

    return () => {
      this.registeredElements.delete(element)
    }
  }

  setAvailableDevices(devices: MediaDeviceInfo[]): void {
    this.availableDevices = devices
  }

  setOutputDevice = async (deviceId: string): Promise<void> => {
    if (deviceId !== 'default') {
      const deviceExists = this.availableDevices.some((device) => device.deviceId === deviceId)

      if (!deviceExists && this.availableDevices.length > 0) return
    }

    if (typeof HTMLAudioElement.prototype.setSinkId === 'undefined') {
      // Save state anyway, but warn
    }

    this.state.deviceId = deviceId

    await this.applyToRegisteredElements(deviceId)

    this._notifyState()
  }

  private async applyToRegisteredElements(deviceId: string): Promise<void> {
    if (this.registeredElements.size === 0) return

    const promises: Promise<void>[] = []

    this.registeredElements.forEach((element) => {
      if ('setSinkId' in element && typeof element.setSinkId === 'function') {
        promises.push(element.setSinkId(deviceId))
      }
    })

    await Promise.allSettled(promises)
  }

  private findSpeakerphone(): MediaDeviceInfo | null {
    if (this.availableDevices.length === 0) {
      return null
    }

    const speakerphone = this.availableDevices.find((device) => {
      const label = device.label.toLowerCase()
      return label.includes('speaker') || label.includes('loud') || label.includes('speakerphone') || label.includes('спикер') || label.includes('громкоговоритель')
    })

    return speakerphone || this.availableDevices[0]
  }

  async autoSelectSpeakerphone(): Promise<boolean> {
    if (!DeviceDetector.isMobile()) {
      return false
    }

    if (typeof HTMLAudioElement.prototype.setSinkId === 'undefined') return false

    const speakerphone = this.findSpeakerphone()

    if (!speakerphone) return false

    try {
      await this.setOutputDevice(speakerphone.deviceId)
      return true
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

    // Immediately call callback with current state
    callback(this.getOutputState())

    return () => this.callbacks.delete(callback)
  }

  private _notifyState(): void {
    const currentState = this.getOutputState()
    this.callbacks.forEach((cb) => cb(currentState))
  }

  /**
   * Проигрывает тестовый звук на текущем устройстве вывода.
   * Если передан url — проигрывается файл, иначе генерируется тон 440Hz.
   */
  async playTestSound(options?: { url?: string; duration?: number }): Promise<void> {
    const duration = options?.duration ?? 2

    if (options?.url) {
      return this.playTestSoundFromUrl(options.url, duration)
    }

    return this.playGeneratedTone(duration)
  }

  private async playTestSoundFromUrl(url: string, duration: number): Promise<void> {
    const audio = new Audio(url)

    if (this.state.deviceId !== 'default' && 'setSinkId' in audio) {
      await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(this.state.deviceId)
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
    if (this.state.deviceId !== 'default' && 'setSinkId' in audioContext) {
      await (audioContext as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(this.state.deviceId)
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
    this.availableDevices = []
    this.registeredElements.clear()
  }
}
