import { ConfigurationService } from './configuration'
import { ConfigurationController } from './configuration'
import { AudioOutputController, CameraController, DevicesController, MicrophoneController } from './media-stream'
import { ValmEvents } from './media-stream/manager-events.types'
import { MediaStreamService } from './media-stream'
import { PermissionsService } from './permissions'
import { IMediaPlugin, PluginContext } from './plugin.types'
import { RecordingController } from './recording'
import { RecordingService } from './recording'
import { ScreenShareController } from './screen-share'
import { ScreenShareService } from './screen-share'
import { TranscriptionController } from './transcription'
import { TranscriptionService } from './transcription'
import { TypedEventEmitter } from './utils'
import { handleIOSMediaError, isIOS } from './utils'
import { ValmConfig, ValmConfiguration, LocalMediaState, MediaEvents } from './types'
import type { EffectsController } from '../effects'

export interface ValmSnapshot {
  initializationState: 'idle' | 'initializing' | 'ready' | 'error'
  error: any
  isIOS: boolean
  iosPermissionsGranted: boolean
}

export class Valm extends TypedEventEmitter<ValmEvents> {
  // Сервисы
  private readonly configurationService: ConfigurationService
  private readonly mediaStreamService: MediaStreamService
  private readonly screenShareService: ScreenShareService
  private readonly recordingService: RecordingService
  private readonly transcriptionService: TranscriptionService
  private readonly permissionsService: PermissionsService

  // Плагины
  private readonly plugins = new Map<string, IMediaPlugin>()

  // Контроллеры
  public readonly configurationController: ConfigurationController
  public readonly cameraController: CameraController
  public readonly microphoneController: MicrophoneController
  public readonly screenShareController: ScreenShareController
  public readonly devicesController: DevicesController
  public readonly audioOutputController: AudioOutputController
  public readonly recordingController: RecordingController
  public readonly transcriptionController: TranscriptionController

  // Состояние инициализации (для subscribe/getSnapshot)
  private initializationState: ValmSnapshot['initializationState'] = 'idle'
  private error: any = null
  private iosPermissionsGranted = false
  private readonly listeners = new Set<VoidFunction>()
  private snapshot: ValmSnapshot
  private unsubscribes: VoidFunction[] = []

  constructor(config: ValmConfig = {}) {
    super()

    this.configurationService = new ConfigurationService(config)
    this.permissionsService = new PermissionsService()
    this.audioOutputController = new AudioOutputController()

    this.devicesController = new DevicesController(
      this.audioOutputController,
      () => ({
        camera: this.mediaStreamService.getState().currentVideoDevice,
        microphone: this.mediaStreamService.getState().currentAudioDevice,
      }),
      this.permissionsService,
    )

    this.mediaStreamService = new MediaStreamService(this.configurationService)
    this.screenShareService = new ScreenShareService(this.configurationService)
    this.recordingService = new RecordingService(this.configurationService, this.mediaStreamService, this.screenShareService)
    this.transcriptionService = new TranscriptionService(this.configurationService)

    this.configurationController = new ConfigurationController(this.configurationService)
    this.cameraController = new CameraController(this.configurationService, this.mediaStreamService)
    this.microphoneController = new MicrophoneController(this.configurationService, this.mediaStreamService)
    this.screenShareController = new ScreenShareController(this.configurationService, this.screenShareService)

    this.recordingController = new RecordingController(this.configurationService, this.recordingService)
    this.transcriptionController = new TranscriptionController(this.configurationService, this.transcriptionService, this.mediaStreamService)

    this.snapshot = this.buildSnapshot()
    this.setupEventListeners()

    if (config.autoInitialize) {
      this.initialize()
    }
  }

  // Доступен только после module.use(new EffectsPlugin())
  get effectsController(): EffectsController {
    const plugin = this.plugins.get('effects')
    if (!plugin || !('controller' in plugin)) {
      throw new Error('EffectsPlugin не установлен. Вызовите module.use(new EffectsPlugin()) для подключения видео-эффектов.')
    }
    return (plugin as unknown as { controller: EffectsController }).controller
  }

  use<T extends IMediaPlugin>(plugin: T): this {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Плагин "${plugin.name}" уже установлен.`)
    }

    const context: PluginContext = {
      mediaStreamService: this.mediaStreamService,
      configurationService: this.configurationService,
    }

    plugin.install(context)
    this.plugins.set(plugin.name, plugin)
    return this
  }

  getPlugin<T extends IMediaPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name)
  }

  subscribe(listener: VoidFunction): VoidFunction {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): ValmSnapshot {
    return this.snapshot
  }

  // Инициализация с отслеживанием состояния (для React через subscribe/getSnapshot)
  async initializeMedia(initConfig?: Partial<ValmConfiguration>): Promise<void> {
    this.error = null
    this.initializationState = 'initializing'
    this.notify()

    try {
      if (initConfig) {
        await this.updateConfiguration(initConfig)
      }
      await this.initialize()
      this.initializationState = 'ready'

      if (isIOS()) {
        this.iosPermissionsGranted = true
      }

      this.notify()
    } catch (err) {
      const handled = handleIOSMediaError(err)
      this.error = { error: err, userMessage: handled.userMessage }
      this.initializationState = 'error'
      this.notify()
      throw err
    }
  }

  // Низкоуровневая инициализация (без трекинга состояния)
  async initialize(): Promise<void> {
    try {
      await this.devicesController._updateCache()
      const config = this.configurationController.getConfig()

      if (config.video.enabled) {
        await this.mediaStreamService.enableVideo()
      }

      if (config.audio.enabled) {
        await this.mediaStreamService.enableAudio()
      }
    } catch (error) {
      this.emit('error', { source: 'initialization', error })
      throw error
    }
  }

  async updateConfiguration(updates: Partial<ValmConfiguration>): Promise<void> {
    if (updates.video) {
      this.configurationController.updateVideoConfig(updates.video)
    }
    if (updates.audio) {
      this.configurationController.updateAudioConfig(updates.audio)
    }
    if (updates.screenShare) {
      this.configurationController.updateScreenShareConfig(updates.screenShare)
    }
    if (updates.recording) {
      this.configurationController.updateRecordingConfig(updates.recording)
    }
    if (updates.transcription) {
      this.configurationController.updateTranscriptionConfig(updates.transcription)
    }
  }

  async resetMedia(): Promise<void> {
    await this.mediaStreamService.resetMedia()
    await this.screenShareController.stop()
  }

  get permissions(): PermissionsService {
    return this.permissionsService
  }

  getConfiguration(): ValmConfiguration {
    return this.configurationController.getConfig()
  }

  getState(): LocalMediaState {
    const effectsPlugin = this.plugins.get('effects') as unknown as { controller: EffectsController } | undefined

    return {
      camera: this.cameraController.state,
      microphone: this.microphoneController.state,
      screenShare: this.screenShareController.state,
      devices: this.devicesController.state,
      transcription: this.transcriptionController.state,
      effects: effectsPlugin?.controller.state ?? null,
    }
  }

  async destroy(): Promise<void> {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.listeners.clear()

    // Уничтожаем плагины
    this.plugins.forEach((plugin) => plugin.destroy())
    this.plugins.clear()

    this.cameraController.destroy()
    this.microphoneController.destroy()
    this.screenShareController.destroy()
    this.devicesController.destroy()
    this.configurationController.destroy()
    this.recordingController.destroy()
    this.recordingService.destroy()
    this.transcriptionController.destroy()

    try {
      await this.mediaStreamService.destroy()
    } catch (error) {
      this.emit('error', { source: 'cleanup', error })
    }

    this.screenShareService.destroy()
    this.transcriptionService.destroy()
    this.permissionsService.destroy()
    this.removeAllListeners()
  }

  private setupEventListeners(): void {
    const handleError = (errorData: any) => {
      if (isIOS()) {
        const handled = handleIOSMediaError(errorData.error)
        this.error = handled.type === 'permission'
          ? { ...errorData, userMessage: handled.userMessage, type: handled.type }
          : errorData
      } else {
        this.error = errorData
      }

      if (errorData.action === 'enable' || errorData.action === 'switch') {
        this.initializationState = 'error'
      }

      this.notify()
    }

    this.unsubscribes.push(
      this.cameraController.onError(handleError),
      this.microphoneController.onError(handleError),
    )

    this.mediaStreamService.on(MediaEvents.ERROR, (error) => {
      this.emit('error', { source: 'media-stream', error })
    })
    this.mediaStreamService.on(MediaEvents.VIDEO_DISABLED, () => {
      this.emit('videoDisabled')
    })
    this.mediaStreamService.on(MediaEvents.AUDIO_DISABLED, () => {
      this.emit('audioDisabled')
    })
    this.mediaStreamService.on(MediaEvents.MEDIA_RESET, () => {
      this.emit('mediaReset')
    })
    this.mediaStreamService.on(MediaEvents.VIDEO_STATE_CHANGED, (state) => {
      this.emit('videoStateChanged', state)
    })
    this.mediaStreamService.on(MediaEvents.AUDIO_STATE_CHANGED, (state) => {
      this.emit('audioStateChanged', state)
    })
  }

  private buildSnapshot(): ValmSnapshot {
    return {
      initializationState: this.initializationState,
      error: this.error,
      isIOS: isIOS(),
      iosPermissionsGranted: this.iosPermissionsGranted,
    }
  }

  private notify(): void {
    this.snapshot = this.buildSnapshot()
    this.listeners.forEach((listener) => listener())
  }
}
