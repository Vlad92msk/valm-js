import { MediaEvents } from '../types'
import { ConfigurationService } from '../configuration'
import { MediaStreamService } from '../media-stream'
import { ScreenShareService } from '../screen-share'
import { TypedEventEmitter } from '../utils'
import { QUALITY_BITRATE_PRESETS } from './mixins/recording-config.mixin'

export interface RecordingOptions {
  mimeType?: string
  videoBitsPerSecond?: number
  audioBitsPerSecond?: number
  includeAudio?: boolean
  includeVideo?: boolean
  includeScreenShare?: boolean
  format?: 'webm' | 'mp4' | 'mkv'
  quality?: 'low' | 'medium' | 'high' | 'custom'
  autoSave?: boolean
  saveDirectory?: string
  maxDuration?: number
  maxFileSize?: number
  chunkInterval?: number
}

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  fileSize: number
  format: string
  quality: string
}

interface RecordingEventMap {
  recordingStarted: (state: RecordingState) => void
  recordingStopped: (blob: Blob) => void
  recordingPaused: (state: RecordingState) => void
  recordingResumed: (state: RecordingState) => void
  recordingData: (data: { chunk: Blob; totalSize: number; duration: number }) => void
  recordingLimitReached: (data: { type: 'duration' | 'fileSize'; limit: number }) => void
  recordingError: (error: unknown) => void
}

export class RecordingService extends TypedEventEmitter<RecordingEventMap> {
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private startTime: number = 0
  private pausedTime: number = 0
  private stream: MediaStream | null = null
  private durationCheckInterval: ReturnType<typeof setInterval> | null = null
  private unsubTrackReplaced: VoidFunction | null = null
  private currentOptions: RecordingOptions = {}
  private isDestroyed = false
  // Останавливается ли запись прямо сейчас (ручной stop или авто-стоп по лимиту).
  // Гейтит авто-триггеры лимитов, чтобы дозапись чанков во время флаша recorder.stop()
  // не эмитила recordingLimitReached повторно и не запускала второй stopRecording.
  private isStopping = false

  constructor(
    private configService: ConfigurationService,
    private mediaStreamService: MediaStreamService,
    private screenShareService?: ScreenShareService,
  ) {
    super()
  }

  async startRecording(options: RecordingOptions = {}): Promise<void> {
    try {
      // Мержим с конфигурацией
      const config = this.configService.getRecordingConfig()
      const mergedOptions = { ...config, ...options }

      // Если quality передан напрямую в options — применяем соответствующий пресет битрейта.
      // (Через ConfigurationController.setRecordingQuality маппинг уже выполнен в конфиге,
      //  но при inline-передаче в startRecording его нужно применить здесь.)
      // Явно заданные в options битрейты имеют приоритет над пресетом.
      if (options.quality && options.quality !== 'custom') {
        const preset = QUALITY_BITRATE_PRESETS[options.quality]
        if (preset) {
          mergedOptions.videoBitsPerSecond = options.videoBitsPerSecond ?? preset.video
          mergedOptions.audioBitsPerSecond = options.audioBitsPerSecond ?? preset.audio
        }
      }

      // Создаем комбинированный поток
      this.stream = await this.createRecordingStream(mergedOptions)

      // Аудио-только запись (голосовое) нельзя писать в video/* контейнере с видеокодеком —
      // MediaRecorder упадёт. Выбираем mime по реальному составу дорожек потока.
      const hasVideo = this.stream.getVideoTracks().length > 0
      const mimeType = this.getBestMimeType(mergedOptions.format, hasVideo)

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: mergedOptions.videoBitsPerSecond || 2500000,
        audioBitsPerSecond: mergedOptions.audioBitsPerSecond || 128000,
      })

      this.setupRecorderEvents()

      this.mediaRecorder.start(mergedOptions.chunkInterval || 1000)
      this.startTime = Date.now()
      this.currentOptions = mergedOptions

      this.setupTrackReplacementListener()
      this.setupDurationLimit(mergedOptions)

      this.emit('recordingStarted', this.getState())
    } catch (error) {
      this.emit('recordingError', error)
      throw error
    }
  }

  pauseRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause()
      this.pausedTime = Date.now()
      this.emit('recordingPaused', this.getState())
    }
  }

  resumeRecording(): void {
    if (this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume()
      this.startTime += Date.now() - this.pausedTime
      this.emit('recordingResumed', this.getState())
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'))
        return
      }

      this.isStopping = true
      const recorder = this.mediaRecorder
      recorder.addEventListener('stop', () => {
        // Если сервис уничтожен пока ждали событие stop — не обрабатываем
        if (this.isDestroyed) {
          reject(new Error('Recording service was destroyed'))
          return
        }

        const blob = new Blob(this.recordedChunks, {
          type: recorder.mimeType,
        })

        this.cleanup()
        this.emit('recordingStopped', blob)
        resolve(blob)
      })

      recorder.stop()
    })
  }

  private async createRecordingStream(options: RecordingOptions): Promise<MediaStream> {
    const combinedStream = new MediaStream()

    // Добавляем видео треки
    if (options.includeVideo !== false) {
      const videoTrack = this.mediaStreamService.getVideoTrack()
      if (videoTrack) {
        combinedStream.addTrack(videoTrack)
      }
    }

    // Добавляем аудио треки
    if (options.includeAudio !== false) {
      const audioTrack = this.mediaStreamService.getAudioTrack()
      if (audioTrack) {
        combinedStream.addTrack(audioTrack)
      }
    }

    // Добавляем скриншеринг
    if (options.includeScreenShare && this.screenShareService) {
      const screenStream = this.screenShareService.getStream()
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          combinedStream.addTrack(track)
        })
      }
    }

    return combinedStream
  }

  private getBestMimeType(preferredFormat?: string, hasVideo: boolean = true): string {
    // Мапинг форматов на MIME types — отдельно для видео и аудио-только записи.
    const videoFormatMap: Record<string, string[]> = {
      webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
      mp4: ['video/mp4;codecs=h264,aac', 'video/mp4'],
      mkv: ['video/x-matroska;codecs=vp9,opus', 'video/x-matroska'],
    }
    const audioFormatMap: Record<string, string[]> = {
      webm: ['audio/webm;codecs=opus', 'audio/webm'],
      mp4: ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'],
      mkv: ['audio/webm;codecs=opus'],
    }
    const formatMap = hasVideo ? videoFormatMap : audioFormatMap

    // Если указан предпочтительный формат, сначала проверяем его
    if (preferredFormat && formatMap[preferredFormat]) {
      const preferredMimeTypes = formatMap[preferredFormat]
      const supportedPreferred = preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))

      if (supportedPreferred) {
        return supportedPreferred
      }
    }

    // Fallback к общему списку приоритетов (по составу дорожек)
    const defaultFormats = hasVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=h264,aac', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']

    return defaultFormats.find((format) => MediaRecorder.isTypeSupported(format)) || defaultFormats[0]
  }

  private setupRecorderEvents(): void {
    if (!this.mediaRecorder) return

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data)

        const totalSize = this.getTotalSize()
        this.emit('recordingData', {
          chunk: event.data,
          totalSize,
          duration: this.getDuration(),
        })

        // Проверяем лимит размера файла (maxFileSize в МБ).
        // isStopping гейтит повтор: во время флаша recorder.stop() прилетает ещё один
        // dataavailable, он не должен снова эмитить лимит и запускать второй stopRecording.
        const maxFileSize = this.currentOptions.maxFileSize
        if (!this.isStopping && maxFileSize && maxFileSize > 0 && totalSize >= maxFileSize * 1024 * 1024) {
          this.isStopping = true
          this.emit('recordingLimitReached', { type: 'fileSize', limit: maxFileSize })
          this.stopRecording()
        }
      }
    })

    this.mediaRecorder.addEventListener('error', ((event: ErrorEvent) => {
      this.emit('recordingError', event.error)
    }) as EventListener)
  }

  destroy(): void {
    this.isDestroyed = true
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    this.cleanup()
    this.removeAllListeners()
  }

  private setupTrackReplacementListener(): void {
    this.unsubTrackReplaced = this.mediaStreamService.on(MediaEvents.TRACK_REPLACED, (event) => {
      if (!this.stream || !this.mediaRecorder || this.mediaRecorder.state === 'inactive') return

      const oldTrack = event.oldTrack
      const newTrack = event.track

      if (oldTrack && this.stream.getTracks().includes(oldTrack)) {
        this.stream.removeTrack(oldTrack)
      }
      if (newTrack) {
        this.stream.addTrack(newTrack)
      }
    })
  }

  private setupDurationLimit(options: RecordingOptions): void {
    const maxDuration = options.maxDuration
    if (!maxDuration || maxDuration <= 0) return

    this.durationCheckInterval = setInterval(() => {
      const duration = this.getDuration()
      if (!this.isStopping && duration >= maxDuration * 1000) {
        this.isStopping = true
        this.emit('recordingLimitReached', { type: 'duration', limit: maxDuration })
        this.stopRecording()
      }
    }, 1000)
  }

  private cleanup(): void {
    if (this.unsubTrackReplaced) {
      this.unsubTrackReplaced()
      this.unsubTrackReplaced = null
    }

    if (this.durationCheckInterval) {
      clearInterval(this.durationCheckInterval)
      this.durationCheckInterval = null
    }

    this.stream = null
    this.mediaRecorder = null
    this.recordedChunks = []
    this.startTime = 0
    this.pausedTime = 0
    this.currentOptions = {}
    this.isStopping = false
  }

  private getTotalSize(): number {
    return this.recordedChunks.reduce((total, chunk) => total + chunk.size, 0)
  }

  private getDuration(): number {
    if (this.startTime === 0) return 0
    if (this.mediaRecorder?.state === 'paused') {
      return this.pausedTime - this.startTime
    }
    return Date.now() - this.startTime
  }

  getState(): RecordingState {
    return {
      isRecording: this.mediaRecorder?.state === 'recording' || false,
      isPaused: this.mediaRecorder?.state === 'paused' || false,
      duration: this.getDuration(),
      fileSize: this.getTotalSize(),
      format: this.mediaRecorder?.mimeType || 'unknown',
      quality: this.currentOptions.quality || 'medium',
    }
  }

  getSupportedFormats(): string[] {
    const formats = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

    return formats.filter((format) => MediaRecorder.isTypeSupported(format))
  }
}
