import {
  AdvancedCameraState,
  CameraExposureMode,
  CameraFocusMode,
  CameraState,
  CameraStateChangeCallback,
  CaptureFrameOptions,
  ErrorCallback,
  VideoConfiguration,
  MediaErrorEvent,
  MediaEvents,
} from '../../types'
import { ConstraintsBuilderService } from '../constraints-builder.service'
import { ConfigurationService } from '../../configuration'
import { MediaStreamService } from '../media-stream.service'

export class CameraController {
  private stateCallbacks = new Set<CameraStateChangeCallback>()
  private errorCallbacks = new Set<ErrorCallback>()
  private isSwitchingDevice = false
  private previewTrack: MediaStreamTrack | null = null
  private unsubscribes: VoidFunction[] = []
  // Скрытый <video> для fallback-захвата кадра и синхронного captureFrameToCanvas
  private captureVideoEl: HTMLVideoElement | null = null

  constructor(
    private configService: ConfigurationService,
    private mediaStreamService: MediaStreamService,
  ) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.unsubscribes.push(
      this.mediaStreamService.on(MediaEvents.VIDEO_STATE_CHANGED, () => {
        this._notifyStateChange(this.state)
      }),
      this.mediaStreamService.on(MediaEvents.ERROR, (error) => {
        this._notifyError({ source: 'camera/microphone', error })
      }),
      this.configService.on('videoConfigChanged', async (event) => {
        if (!this.state.isEnabled) return

        try {
          if (event.property === 'deviceId' && !this.isSwitchingDevice) {
            await this.mediaStreamService.switchVideoDevice()
          } else if (['resolution', 'frameRate', 'constraints'].includes(event.property)) {
            await this.restart()
          }
        } catch (error) {
          this._notifyError({ source: 'camera', action: 'configUpdate', error })
        }
      }),
    )
  }

  destroy(): void {
    this.stopPreview()
    this.releaseCaptureVideo()
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.stateCallbacks.clear()
    this.errorCallbacks.clear()
  }

  updateResolution = (width: number, height: number): void => {
    this.configService.setVideoResolution(width, height)
  }

  updateFrameRate = (frameRate: number): void => {
    this.configService.setVideoFrameRate(frameRate)
  }

  updateDevice = async (deviceId: string): Promise<void> => {
    this.configService.setVideoDevice(deviceId)
  }

  updateConstraints = (constraints: MediaTrackConstraints): void => {
    const currentConfig = this.configService.getVideoConfig()
    this.configService.updateVideoConfig({
      constraints: { ...currentConfig.constraints, ...constraints },
    })
  }

  private async restart(): Promise<void> {
    if (this.state.isEnabled) {
      this.disable()
      await this.enable()
    }
  }

  enable = async (deviceId?: string): Promise<void> => {
    try {
      if (deviceId) {
        this.configService.setVideoDevice(deviceId)
      }

      await this.mediaStreamService.enableVideo()
      this.configService.updateVideoConfig({ enabled: true })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'enable', error })
      throw error
    }
  }

  disable = (): void => {
    try {
      this.mediaStreamService.disableVideo()
      this.configService.updateVideoConfig({ enabled: false })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'disable', error })
      throw error
    }
  }

  toggle = async (): Promise<void> => {
    const mediaState = this.mediaStreamService.getState()

    if (mediaState.isVideoEnabled) {
      this.disable()
      return Promise.resolve()
    } else {
      return this.enable()
    }
  }

  switchDevice = async (deviceId: string): Promise<void> => {
    try {
      this.isSwitchingDevice = true
      this.configService.setVideoDevice(deviceId)
      if (this.state.isEnabled) {
        await this.mediaStreamService.switchVideoDevice(deviceId)
      }
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'switch', error })
      throw error
    } finally {
      this.isSwitchingDevice = false
    }
  }

  toggleFacing = async (): Promise<void> => {
    try {
      const currentFacing = this.configService.getVideoConfig().facingMode || 'user'
      const newFacing = currentFacing === 'user' ? 'environment' : 'user'

      this.configService.updateVideoConfig({
        facingMode: newFacing,
        deviceId: null,
      })

      if (this.state.isEnabled) {
        await this.mediaStreamService.switchVideoDevice()
      }
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'toggleFacing', error })
      throw error
    }
  }

  // Создать preview трек для предпросмотра (не добавляется в основной stream)
  preview = async (deviceId?: string): Promise<MediaStreamTrack> => {
    // Останавливаем предыдущий preview если есть
    this.stopPreview()

    try {
      const config = this.configService.getVideoConfig()
      const effectiveConfig = deviceId ? { ...config, deviceId } : config
      const constraints = ConstraintsBuilderService.buildVideoConstraints(effectiveConfig)

      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints })
      this.previewTrack = stream.getVideoTracks()[0]

      this._notifyStateChange(this.state)
      return this.previewTrack
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'preview', error })
      throw error
    }
  }

  // Опубликовать preview трек в основной stream
  publishPreview = async (): Promise<void> => {
    if (!this.previewTrack) {
      throw new Error('No preview track to publish. Call preview() first.')
    }

    try {
      const track = this.previewTrack
      this.previewTrack = null

      await this.mediaStreamService.enableVideoWithTrack(track)
      this.configService.updateVideoConfig({ enabled: true })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'publishPreview', error })
      throw error
    }
  }

  // Остановить preview без публикации
  stopPreview = (): void => {
    if (this.previewTrack) {
      this.previewTrack.stop()
      this.previewTrack = null
      this._notifyStateChange(this.state)
    }
  }

  reset = async (): Promise<void> => {
    if (this.state.isEnabled) {
      this.disable()
    }
  }

  onTrackReplaced = (callback: (event: { oldTrack: MediaStreamTrack; newTrack: MediaStreamTrack; source?: 'device' | 'background' }) => void): VoidFunction => {
    return this.mediaStreamService.on(MediaEvents.TRACK_REPLACED, (event) => {
      if (event.kind === 'video') {
        callback({ oldTrack: event.oldTrack!, newTrack: event.track, source: event.source })
      }
    })
  }

  getConfiguration = (): VideoConfiguration => {
    return this.configService.getVideoConfig()
  }

  onStateChange = (callback: CameraStateChangeCallback): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onError = (callback: ErrorCallback): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private _notifyStateChange(state: CameraState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyError(error: MediaErrorEvent): void {
    if (error.source === 'camera' || error.source === 'camera/microphone') {
      this.errorCallbacks.forEach((callback) => callback(error))
    }
  }

  getStream(): MediaStream | null {
    return this.mediaStreamService.getStream()
  }

  getTrack(): MediaStreamTrack | null {
    return this.mediaStreamService.getVideoTrack()
  }

  // Оригинальный трек камеры (без обработки pipeline)
  private getRawTrack(): MediaStreamTrack | null {
    return this.mediaStreamService.getVideoTrackManager().getRawTrack()
  }

  // Снимок кадра (после эффектов, если pipeline активен)
  captureFrame = async (options: CaptureFrameOptions = {}): Promise<Blob> => {
    try {
      const canvas = await this.drawCurrentFrame(options)
      const format = options.format ?? 'image/png'
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('captureFrame: toBlob вернул null'))),
          format,
          options.quality,
        )
      })
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'captureFrame', error })
      throw error
    }
  }

  captureFrameDataURL = async (options: CaptureFrameOptions = {}): Promise<string> => {
    try {
      const canvas = await this.drawCurrentFrame(options)
      return canvas.toDataURL(options.format ?? 'image/png', options.quality)
    } catch (error) {
      this._notifyError({ source: 'camera', action: 'captureFrame', error })
      throw error
    }
  }

  // Синхронный захват. Требует уже прогретого кадра — иначе прогревает и бросает
  captureFrameToCanvas = (canvas?: HTMLCanvasElement): HTMLCanvasElement => {
    const track = this.getTrack()
    if (!track || track.readyState !== 'live') {
      const error = new Error('captureFrameToCanvas: нет активного видео-трека')
      this._notifyError({ source: 'camera', action: 'captureFrame', error })
      throw error
    }

    const video = this.captureVideoEl
    const boundTrack = this.boundCaptureTrack()

    if (!video || boundTrack !== track || video.readyState < 2) {
      // Прогреваем для последующих синхронных вызовов
      void this.ensureCaptureVideo(track).catch(() => {})
      const error = new Error('captureFrameToCanvas: кадр ещё не готов. Повторите вызов или используйте асинхронный captureFrame().')
      this._notifyError({ source: 'camera', action: 'captureFrame', error })
      throw error
    }

    return this.drawSourceToCanvas(video, canvas)
  }

  private async drawCurrentFrame(options: CaptureFrameOptions): Promise<HTMLCanvasElement> {
    const track = this.getTrack()
    if (!track || track.readyState !== 'live') {
      throw new Error('captureFrame: нет активного видео-трека')
    }

    const source = await this.acquireFrameSource(track)
    try {
      return this.drawSourceToCanvas(source, undefined, options)
    } finally {
      if (source instanceof ImageBitmap) source.close()
    }
  }

  // Основной путь — ImageCapture.grabFrame(); фолбэк — скрытый <video>
  private async acquireFrameSource(track: MediaStreamTrack): Promise<ImageBitmap | HTMLVideoElement> {
    const ImageCaptureCtor = (globalThis as unknown as { ImageCapture?: new (track: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture
    if (ImageCaptureCtor) {
      try {
        const capture = new ImageCaptureCtor(track)
        return await capture.grabFrame()
      } catch {
        // ImageCapture не поддержан для этого трека — уходим в video-фолбэк
      }
    }
    return this.ensureCaptureVideo(track)
  }

  private boundCaptureTrack(): MediaStreamTrack | null {
    const src = this.captureVideoEl?.srcObject
    return src instanceof MediaStream ? src.getVideoTracks()[0] ?? null : null
  }

  private async ensureCaptureVideo(track: MediaStreamTrack): Promise<HTMLVideoElement> {
    let video = this.captureVideoEl

    if (!video) {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      this.captureVideoEl = video
    }

    if (this.boundCaptureTrack() !== track) {
      video.srcObject = new MediaStream([track])
      await video.play().catch(() => {})
    }

    if (video.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          video!.removeEventListener('loadeddata', onReady)
          video!.removeEventListener('error', onError)
        }
        const onReady = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error('captureFrame: не удалось загрузить кадр в <video>'))
        }
        video!.addEventListener('loadeddata', onReady)
        video!.addEventListener('error', onError)
      })
    }

    return video
  }

  private drawSourceToCanvas(source: ImageBitmap | HTMLVideoElement, targetCanvas?: HTMLCanvasElement, options?: CaptureFrameOptions): HTMLCanvasElement {
    const nativeW = source instanceof ImageBitmap ? source.width : source.videoWidth
    const nativeH = source instanceof ImageBitmap ? source.height : source.videoHeight

    if (!nativeW || !nativeH) {
      throw new Error('captureFrame: нулевой размер кадра')
    }

    const { width, height } = this.scaleDimensions(nativeW, nativeH, options)
    const canvas = targetCanvas ?? document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('captureFrame: не удалось получить 2d-контекст canvas')
    }

    ctx.drawImage(source, 0, 0, width, height)
    return canvas
  }

  private scaleDimensions(nativeW: number, nativeH: number, options?: CaptureFrameOptions): { width: number; height: number } {
    const ow = options?.width
    const oh = options?.height

    if (!ow && !oh) return { width: nativeW, height: nativeH }
    if (ow && oh) return { width: ow, height: oh }
    if (ow) return { width: ow, height: Math.round(nativeH * (ow / nativeW)) }
    return { width: Math.round(nativeW * (oh! / nativeH)), height: oh! }
  }

  private releaseCaptureVideo(): void {
    if (this.captureVideoEl) {
      // Не останавливаем трек — он живой и принадлежит основному потоку
      this.captureVideoEl.srcObject = null
      this.captureVideoEl = null
    }
  }

  // zoom/torch/focus/exposure — на сыром треке; no-op с ошибкой, если не поддержано
  getCapabilities = (): MediaTrackCapabilities | null => {
    const track = this.getRawTrack()
    if (!track || typeof track.getCapabilities !== 'function') return null
    return track.getCapabilities()
  }

  setZoom = async (value: number): Promise<void> => {
    const track = this.getRawTrack()
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }) | undefined

    if (!track || !caps || !caps.zoom) {
      return this.failAdvanced('setZoom', 'Устройство не поддерживает zoom.')
    }

    const { min, max } = caps.zoom
    const clamped = Math.min(max, Math.max(min, value))
    await this.applyAdvancedConstraint(track, { zoom: clamped }, 'setZoom')
  }

  toggleTorch = async (on?: boolean): Promise<void> => {
    const next = on ?? !this.getAdvancedState().torch.on
    const track = this.getRawTrack()
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean | boolean[] }) | undefined

    if (!track || !caps || !this.torchSupported(caps.torch)) {
      return this.failAdvanced('toggleTorch', 'Устройство не поддерживает вспышку (torch).')
    }

    await this.applyAdvancedConstraint(track, { torch: next }, 'toggleTorch')
  }

  setFocusMode = async (mode: CameraFocusMode): Promise<void> => {
    const track = this.getRawTrack()
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined

    if (!track || !caps || !Array.isArray(caps.focusMode) || !caps.focusMode.includes(mode)) {
      return this.failAdvanced('setFocusMode', `Устройство не поддерживает режим фокуса "${mode}".`)
    }

    await this.applyAdvancedConstraint(track, { focusMode: mode }, 'setFocusMode')
  }

  setExposureMode = async (mode: CameraExposureMode): Promise<void> => {
    const track = this.getRawTrack()
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { exposureMode?: string[] }) | undefined

    if (!track || !caps || !Array.isArray(caps.exposureMode) || !caps.exposureMode.includes(mode)) {
      return this.failAdvanced('setExposureMode', `Устройство не поддерживает режим экспозиции "${mode}".`)
    }

    await this.applyAdvancedConstraint(track, { exposureMode: mode }, 'setExposureMode')
  }

  getAdvancedState = (): AdvancedCameraState => {
    const track = this.getRawTrack()
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step?: number }
      torch?: boolean | boolean[]
      focusMode?: string[]
      exposureMode?: string[]
    }
    const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings & {
      zoom?: number
      torch?: boolean
      focusMode?: string
      exposureMode?: string
    }

    return {
      zoom: {
        supported: !!caps.zoom,
        min: caps.zoom?.min,
        max: caps.zoom?.max,
        step: caps.zoom?.step,
        value: settings.zoom,
      },
      torch: {
        supported: this.torchSupported(caps.torch),
        on: settings.torch ?? false,
      },
      focus: {
        supported: Array.isArray(caps.focusMode) && caps.focusMode.length > 0,
        mode: settings.focusMode,
      },
      exposure: {
        supported: Array.isArray(caps.exposureMode) && caps.exposureMode.length > 0,
        mode: settings.exposureMode,
      },
    }
  }

  private torchSupported(torch: boolean | boolean[] | undefined): boolean {
    if (Array.isArray(torch)) return torch.includes(true)
    return torch === true
  }

  private async applyAdvancedConstraint(track: MediaStreamTrack, constraint: Record<string, unknown>, action: string): Promise<void> {
    try {
      await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints)
      this._notifyStateChange(this.state)
    } catch (error) {
      this._notifyError({ source: 'camera', action, error })
      throw error
    }
  }

  private failAdvanced(action: string, message: string): never {
    const error = new Error(message)
    this._notifyError({ source: 'camera', action, error })
    throw error
  }

  get state(): CameraState {
    const mediaState = this.mediaStreamService.getState()
    // Берём оригинальный трек камеры, а не выход pipeline (canvas capture без width/height/frameRate)
    const rawTrack = this.mediaStreamService.getVideoTrackManager().getRawTrack()
    const settings = rawTrack?.getSettings() ?? null

    return {
      isEnabled: mediaState.isVideoEnabled,
      isMuted: mediaState.isVideoMuted,
      isPreviewing: this.previewTrack !== null,
      hasDevice: mediaState.hasVideo,
      deviceId: mediaState.currentVideoDevice,
      settings,
    }
  }
}
