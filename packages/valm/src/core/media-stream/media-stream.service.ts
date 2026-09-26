import { MediaEvents, TrackEvent, VolumeChangeEvent } from '../types'
import { ConfigurationService } from '../configuration'
import { TypedEventEmitter } from '../utils'
import { VoiceActivityDetector } from '../utils'
import { AudioTrackEvents, AudioTrackManagerService } from './audio-track-manager.service'
import { ConstraintsBuilderService } from './constraints-builder.service'
import { MediaStreamState } from './media.types'
import { VideoTrackEvents, VideoTrackManagerService } from './video-track-manager.service'
import { DeviceFallbackEvent, SourceMuteChangeEvent, TrackEndedEvent } from './device.types'
import { SwitchOutcome, TrackDeviceInfo } from './track-manager.shared'

type MediaKind = 'audio' | 'video'
const VIRTUAL_DEVICE_IDS = new Set(['default', 'communications', ''])
// Сколько ждать devicechange после 'ended', чтобы отличить пропажу устройства от остановки трека
const DEVICE_LOST_PROBE_MS = 1000

export { MediaEvents }
export type { MediaStreamState, TrackEvent, VolumeChangeEvent }

interface MediaStreamEventMap {
  [MediaEvents.STATE_CHANGED]: (state: MediaStreamState) => void
  [MediaEvents.TRACK_ADDED]: (event: TrackEvent) => void
  [MediaEvents.TRACK_REMOVED]: (event: TrackEvent) => void
  [MediaEvents.TRACK_MUTED]: (event: TrackEvent) => void
  [MediaEvents.TRACK_UNMUTED]: (event: TrackEvent) => void
  [MediaEvents.TRACK_REPLACED]: (event: TrackEvent) => void
  [MediaEvents.VIDEO_STATE_CHANGED]: (state: MediaStreamState) => void
  [MediaEvents.AUDIO_STATE_CHANGED]: (state: MediaStreamState) => void
  [MediaEvents.VIDEO_DISABLED]: () => void
  [MediaEvents.AUDIO_DISABLED]: () => void
  [MediaEvents.MEDIA_RESET]: () => void
  [MediaEvents.VOLUME_CHANGE]: (event: VolumeChangeEvent) => void
  [MediaEvents.SOURCE_MUTE_CHANGED]: (event: SourceMuteChangeEvent & { kind: MediaKind }) => void
  [MediaEvents.TRACK_ENDED]: (event: TrackEndedEvent) => void
  [MediaEvents.DEVICE_FALLBACK]: (event: DeviceFallbackEvent & { kind: MediaKind }) => void
  // kind — чей менеджер упал (N4: камера и микрофон фильтруют свои ошибки)
  [MediaEvents.ERROR]: (error: unknown, kind?: MediaKind) => void
}

export class MediaStreamService extends TypedEventEmitter<MediaStreamEventMap> {
  private stream: MediaStream | null = null
  private unsubscribes: VoidFunction[] = []

  private videoManager: VideoTrackManagerService
  private audioManager: AudioTrackManagerService
  // Идёт автовосстановление после пропажи устройства: fallback-событие получит reason 'device-lost'
  private recovering = new Set<MediaKind>()

  constructor(private configService: ConfigurationService) {
    super()

    // Создаём менеджеры
    this.videoManager = new VideoTrackManagerService(() => this.configService.getVideoConfig())

    this.audioManager = new AudioTrackManagerService(
      () => this.configService.getAudioConfig(),
      (options) => new VoiceActivityDetector(options),
    )

    // Подписываемся на события менеджеров
    this.setupVideoManagerListeners()
    this.setupAudioManagerListeners()
  }

  async enableVideo(): Promise<void> {
    const track = await this.videoManager.enable()
    if (track) {
      this.addTrackToStream(track)
    }
  }

  async enableVideoWithTrack(track: MediaStreamTrack): Promise<void> {
    const outputTrack = await this.videoManager.enableWithTrack(track)
    if (outputTrack) {
      this.addTrackToStream(outputTrack)
    }
  }

  disableVideo(): void {
    this.videoManager.disable()
    this.emit(MediaEvents.VIDEO_DISABLED)
  }

  muteVideo(): void {
    this.videoManager.mute()
  }

  unmuteVideo(): void {
    this.videoManager.unmute()
  }

  async switchVideoDevice(deviceId?: string, options?: { force?: boolean }): Promise<SwitchOutcome> {
    if (deviceId && this.configService.getVideoConfig().deviceId !== deviceId) {
      this.configService.setVideoDevice(deviceId)
    }
    return this.videoManager.switchDevice(deviceId, options)
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.videoManager.getOutputTrack()
  }

  // Создать отдельный видео трек (не добавляется в stream, потребитель сам вызывает track.stop())
  async createAdditionalVideoTrack(deviceId: string): Promise<MediaStreamTrack> {
    const config = this.configService.getVideoConfig()
    const constraints = ConstraintsBuilderService.buildVideoConstraints({
      ...config,
      deviceId,
    })
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: constraints })
    return tempStream.getVideoTracks()[0]
  }

  // Прямой доступ к VideoTrackManager (для интеграции с VideoProcessingPipeline)
  getVideoTrackManager(): VideoTrackManagerService {
    return this.videoManager
  }

  getAudioTrackManagerService(): AudioTrackManagerService {
    return this.audioManager
  }

  // Аудио-граф микрофона — для MicrophoneController и AudioEffectsPlugin
  getAudioProcessingPipeline() {
    return this.audioManager.getPipeline()
  }

  // Публиковать обработанный трек через граф
  async engageAudioProcessing(): Promise<void> {
    await this.audioManager.engageProcessing()
  }

  // Вернуться к оригинальному треку микрофона
  disengageAudioProcessing(): void {
    this.audioManager.disengageProcessing()
  }

  async enableAudio(): Promise<void> {
    const track = await this.audioManager.enable()
    if (track) {
      this.addTrackToStream(track)
    }
  }

  async enableAudioWithTrack(track: MediaStreamTrack): Promise<void> {
    const outputTrack = await this.audioManager.enableWithTrack(track)
    if (outputTrack) {
      this.addTrackToStream(outputTrack)
    }
  }

  disableAudio(): void {
    this.audioManager.disable()
    this.emit(MediaEvents.AUDIO_DISABLED)
  }

  muteAudio(): void {
    this.audioManager.mute()
  }

  unmuteAudio(): void {
    this.audioManager.unmute()
  }

  async switchAudioDevice(deviceId?: string, options?: { force?: boolean }): Promise<SwitchOutcome> {
    if (deviceId && this.configService.getAudioConfig().deviceId !== deviceId) {
      this.configService.setAudioDevice(deviceId)
    }
    return this.audioManager.switchDevice(deviceId, options)
  }

  // Последнее открытое устройство (переживает 'ended', сбрасывается при disable)
  getLastDevice(kind: MediaKind): TrackDeviceInfo | null {
    return kind === 'audio' ? this.audioManager.getLastDevice() : this.videoManager.getLastDevice()
  }

  // deviceId, вместо которого сейчас открыто системное устройство (deviceFallback), иначе null
  getFallbackFrom(kind: MediaKind): string | null {
    return kind === 'audio' ? this.audioManager.getFallbackFrom() : this.videoManager.getFallbackFrom()
  }

  getAudioTrack(): MediaStreamTrack | null {
    return this.audioManager.getTrack()
  }

  getStream(): MediaStream | null {
    return this.stream
  }

  getState(): MediaStreamState {
    const videoState = this.videoManager.getState()
    const audioState = this.audioManager.getState()

    return {
      stream: this.stream,
      hasVideo: videoState.track !== null,
      hasAudio: audioState.track !== null,
      isVideoEnabled: videoState.isEnabled,
      isAudioEnabled: audioState.isEnabled,
      isVideoMuted: videoState.isMuted,
      isAudioMuted: audioState.isMuted,
      isSpeaking: audioState.isSpeaking,
      isVideoSourceMuted: videoState.isSourceMuted,
      isAudioSourceMuted: audioState.isSourceMuted,
      volume: audioState.volume,
      currentVideoDevice: videoState.deviceId,
      currentAudioDevice: audioState.deviceId,
      videoSettings: videoState.settings,
      audioSettings: audioState.settings,
    }
  }

  async resetMedia(): Promise<void> {
    const hadVideo = this.videoManager.getState().isEnabled
    const hadAudio = this.audioManager.getState().isEnabled

    if (hadVideo) {
      this.disableVideo()
    }
    if (hadAudio) {
      this.disableAudio()
    }

    if (hadVideo || hadAudio) {
      this.emit(MediaEvents.MEDIA_RESET)
    }
  }

  async stopStream(): Promise<void> {
    this.videoManager.disable()
    this.audioManager.disable()
    this.stream = null
    this.emit(MediaEvents.STATE_CHANGED, this.getState())
  }

  async destroy(): Promise<void> {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.videoManager.destroy()
    this.audioManager.destroy()
    this.stream = null
    this.removeAllListeners()
  }

  private ensureStream(): MediaStream {
    if (!this.stream) {
      this.stream = new MediaStream()
    }
    return this.stream
  }

  private addTrackToStream(track: MediaStreamTrack): void {
    const stream = this.ensureStream()

    // Проверяем что трек ещё не добавлен
    const existingTrack = track.kind === 'video' ? stream.getVideoTracks().find((t) => t.id === track.id) : stream.getAudioTracks().find((t) => t.id === track.id)

    if (!existingTrack) {
      stream.addTrack(track)
    }
  }

  private removeTrackFromStream(track: MediaStreamTrack): void {
    if (this.stream) {
      this.stream.removeTrack(track)
    }
  }

  private setupVideoManagerListeners(): void {
    this.unsubscribes.push(
      this.videoManager.on(VideoTrackEvents.TRACK_ADDED, ({ track }) => {
        this.addTrackToStream(track)
        this.emit(MediaEvents.TRACK_ADDED, {
          kind: 'video',
          track,
          stream: this.stream,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.TRACK_REMOVED, ({ track }) => {
        this.removeTrackFromStream(track)
        this.emit(MediaEvents.TRACK_REMOVED, {
          kind: 'video',
          track,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.TRACK_REPLACED, ({ track, oldTrack, source }) => {
        if (oldTrack) {
          this.removeTrackFromStream(oldTrack)
        }
        this.addTrackToStream(track)
        this.emit(MediaEvents.TRACK_REPLACED, {
          kind: 'video',
          track,
          oldTrack,
          stream: this.stream,
          source,
          isMuted: this.videoManager.getState().isMuted,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.TRACK_MUTED, ({ track }) => {
        this.emit(MediaEvents.TRACK_MUTED, { kind: 'video', track } as TrackEvent)
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.TRACK_UNMUTED, ({ track }) => {
        this.emit(MediaEvents.TRACK_UNMUTED, { kind: 'video', track } as TrackEvent)
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.STATE_CHANGED, () => {
        this.emit(MediaEvents.VIDEO_STATE_CHANGED, this.getState())
      }),
      this.videoManager.on(VideoTrackEvents.ERROR, (error) => {
        this.emit(MediaEvents.ERROR, error, 'video')
      }),
      this.videoManager.on(VideoTrackEvents.SOURCE_MUTE_CHANGED, (event) => {
        this.emit(MediaEvents.SOURCE_MUTE_CHANGED, { kind: 'video', ...event })
        this.emitStateChanged()
      }),
      this.videoManager.on(VideoTrackEvents.DEVICE_FALLBACK, (event) => this.emitFallback('video', event)),
      this.videoManager.on(VideoTrackEvents.TRACK_ENDED, (device) => void this.handleTrackEnded('video', device)),
    )
  }

  private setupAudioManagerListeners(): void {
    this.unsubscribes.push(
      this.audioManager.on(AudioTrackEvents.TRACK_ADDED, ({ track }) => {
        this.addTrackToStream(track)
        this.emit(MediaEvents.TRACK_ADDED, {
          kind: 'audio',
          track,
          stream: this.stream,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.TRACK_REMOVED, ({ track }) => {
        this.removeTrackFromStream(track)
        this.emit(MediaEvents.TRACK_REMOVED, {
          kind: 'audio',
          track,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.TRACK_REPLACED, ({ track, oldTrack }) => {
        if (oldTrack) {
          this.removeTrackFromStream(oldTrack)
        }
        this.addTrackToStream(track)
        this.emit(MediaEvents.TRACK_REPLACED, {
          kind: 'audio',
          track,
          oldTrack,
          stream: this.stream,
          isMuted: this.audioManager.getState().isMuted,
        } as TrackEvent)
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.TRACK_MUTED, ({ track }) => {
        this.emit(MediaEvents.TRACK_MUTED, { kind: 'audio', track } as TrackEvent)
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.TRACK_UNMUTED, ({ track }) => {
        this.emit(MediaEvents.TRACK_UNMUTED, { kind: 'audio', track } as TrackEvent)
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.STATE_CHANGED, () => {
        this.emit(MediaEvents.AUDIO_STATE_CHANGED, this.getState())
      }),
      this.audioManager.on(AudioTrackEvents.VOLUME_CHANGE, (payload) => {
        this.emit(MediaEvents.VOLUME_CHANGE, payload as VolumeChangeEvent)
      }),
      this.audioManager.on(AudioTrackEvents.ERROR, (error) => {
        this.emit(MediaEvents.ERROR, error, 'audio')
      }),
      this.audioManager.on(AudioTrackEvents.SOURCE_MUTE_CHANGED, (event) => {
        this.emit(MediaEvents.SOURCE_MUTE_CHANGED, { kind: 'audio', ...event })
        this.emitStateChanged()
      }),
      this.audioManager.on(AudioTrackEvents.DEVICE_FALLBACK, (event) => this.emitFallback('audio', event)),
      this.audioManager.on(AudioTrackEvents.TRACK_ENDED, (device) => void this.handleTrackEnded('audio', device)),
    )
  }

  private emitFallback(kind: MediaKind, event: DeviceFallbackEvent): void {
    this.emit(MediaEvents.DEVICE_FALLBACK, { kind, ...event, reason: this.recovering.has(kind) ? 'device-lost' : event.reason })
  }

  // Трек завершился не по disable(): выясняем причину и при deviceFallback: 'default' переоткрываем системное устройство.
  // config.enabled при этом не трогаем — это намерение пользователя, а не фактическое состояние
  private async handleTrackEnded(kind: MediaKind, device: TrackDeviceInfo): Promise<void> {
    const lost = await this.isDeviceLost(kind, device)
    this.emit(MediaEvents.TRACK_ENDED, { kind, reason: lost ? 'device-lost' : 'ended', ...device })

    const config = kind === 'audio' ? this.configService.getAudioConfig() : this.configService.getVideoConfig()
    const manager = kind === 'audio' ? this.audioManager : this.videoManager
    if (!lost || config.deviceFallback !== 'default' || !config.enabled || manager.getState().isEnabled) return

    this.recovering.add(kind)
    try {
      await (kind === 'audio' ? this.enableAudio() : this.enableVideo())
    } catch {
      // ошибка уже ушла в ERROR через менеджер
    } finally {
      this.recovering.delete(kind)
    }
  }

  private async isDeviceLost(kind: MediaKind, device: TrackDeviceInfo): Promise<boolean> {
    if (!navigator.mediaDevices?.enumerateDevices) return false
    const deviceKind = kind === 'audio' ? 'audioinput' : 'videoinput'

    const check = async () => {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === deviceKind)
      // Для виртуального id ('default') сверяем по groupId: после отключения у записи 'default' он меняется
      if (!device.deviceId || VIRTUAL_DEVICE_IDS.has(device.deviceId)) {
        return device.groupId ? !devices.some((d) => d.groupId === device.groupId) : false
      }
      return !devices.some((d) => d.deviceId === device.deviceId)
    }

    try {
      if (await check()) return true
      // 'ended' обычно приходит раньше devicechange — даём списку устройств обновиться
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          navigator.mediaDevices.removeEventListener('devicechange', done)
          resolve()
        }
        const timer = setTimeout(done, DEVICE_LOST_PROBE_MS)
        navigator.mediaDevices.addEventListener('devicechange', done)
      })
      return await check()
    } catch {
      return false
    }
  }

  private emitStateChanged(): void {
    this.emit(MediaEvents.STATE_CHANGED, this.getState())
  }
}
