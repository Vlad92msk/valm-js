import { MediaEvents, TrackEvent, VolumeChangeEvent } from '../types'
import { ConfigurationService } from '../configuration'
import { TypedEventEmitter } from '../utils'
import { VoiceActivityDetector } from '../utils'
import { AudioTrackEvents, AudioTrackManagerService } from './audio-track-manager.service'
import { ConstraintsBuilderService } from './constraints-builder.service'
import { MediaStreamState } from './media.types'
import { VideoTrackEvents, VideoTrackManagerService } from './video-track-manager.service'

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
  [MediaEvents.ERROR]: (error: unknown) => void
}

export class MediaStreamService extends TypedEventEmitter<MediaStreamEventMap> {
  private stream: MediaStream | null = null
  private unsubscribes: VoidFunction[] = []

  private videoManager: VideoTrackManagerService
  private audioManager: AudioTrackManagerService

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

  async switchVideoDevice(deviceId?: string): Promise<void> {
    if (deviceId) {
      this.configService.setVideoDevice(deviceId)
    }
    await this.videoManager.switchDevice(deviceId)
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

  async switchAudioDevice(deviceId?: string): Promise<void> {
    if (deviceId) {
      this.configService.setAudioDevice(deviceId)
    }
    await this.audioManager.switchDevice(deviceId)
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
      this.videoManager.on(VideoTrackEvents.TRACK_REPLACED, ({ track, oldTrack }) => {
        if (oldTrack) {
          this.removeTrackFromStream(oldTrack)
        }
        this.addTrackToStream(track)
        this.emit(MediaEvents.TRACK_REPLACED, {
          kind: 'video',
          track,
          oldTrack,
          stream: this.stream,
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
        this.emit(MediaEvents.ERROR, error)
      }),
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
        this.emit(MediaEvents.ERROR, error)
      }),
    )
  }

  private emitStateChanged(): void {
    this.emit(MediaEvents.STATE_CHANGED, this.getState())
  }
}
