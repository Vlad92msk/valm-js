import { ConfigurationChangeEvent, ValmConfiguration, RecordingConfiguration } from '../../types'
import { BaseConfigurationService, Constructor } from '../../configuration/mixins/base.mixin'

export const DEFAULT_RECORDING_CONFIG: RecordingConfiguration = {
  enabled: false,
  format: 'webm',
  quality: 'medium',
  videoBitsPerSecond: 2500000, // 2.5 Mbps
  audioBitsPerSecond: 128000, // 128 kbps
  includeVideo: true,
  includeAudio: true,
  includeScreenShare: false,
  autoSave: true,
  maxDuration: 0, // без ограничений
  maxFileSize: 0, // без ограничений
  chunkInterval: 1000, // 1 секунда
}

export function WithRecordingConfiguration<T extends Constructor<BaseConfigurationService>>(Base: T) {
  return class RecordingConfigMixin extends Base {
    protected getDefaultConfig() {
      return {
        ...super.getDefaultConfig(),
        recording: DEFAULT_RECORDING_CONFIG,
      }
    }

    protected setupValidators() {
      super.setupValidators()
      this.validators.set('recording.videoBitsPerSecond', (value) => Number.isInteger(value) && value > 0 && value <= 50000000)
      this.validators.set('recording.audioBitsPerSecond', (value) => Number.isInteger(value) && value > 0 && value <= 512000)
      this.validators.set('recording.maxDuration', (value) => Number.isInteger(value) && value >= 0)
      this.validators.set('recording.maxFileSize', (value) => Number.isInteger(value) && value >= 0)
      this.validators.set('recording.chunkInterval', (value) => Number.isInteger(value) && value >= 100)
      this.validators.set('recording.format', (value) => ['webm', 'mp4', 'mkv'].includes(value))
      this.validators.set('recording.quality', (value) => ['low', 'medium', 'high', 'custom'].includes(value))
    }

    getRecordingConfig(): RecordingConfiguration {
      return this.deepClone(this.config.recording)
    }

    updateRecordingConfig(updates: Partial<RecordingConfiguration>): void {
      this.updateSection('recording', updates)
    }

    setRecordingFormat(format: 'webm' | 'mp4' | 'mkv'): void {
      this.validateAndSet('recording.format', format)
      const oldValue = this.config.recording.format
      this.config.recording.format = format
      this.emitChange('recording', 'format', oldValue, format)
    }

    setRecordingQuality(quality: 'low' | 'medium' | 'high' | 'custom'): void {
      this.validateAndSet('recording.quality', quality)
      const oldValue = this.config.recording.quality
      this.config.recording.quality = quality

      if (quality !== 'custom') {
        const qualityPresets = {
          low: { video: 1000000, audio: 64000 },
          medium: { video: 2500000, audio: 128000 },
          high: { video: 5000000, audio: 256000 },
        }
        const preset = qualityPresets[quality]
        this.config.recording.videoBitsPerSecond = preset.video
        this.config.recording.audioBitsPerSecond = preset.audio
      }

      this.emitChange('recording', 'quality', oldValue, quality)
    }

    setRecordingBitrates(videoBitsPerSecond: number, audioBitsPerSecond: number): void {
      this.validateAndSet('recording.videoBitsPerSecond', videoBitsPerSecond)
      this.validateAndSet('recording.audioBitsPerSecond', audioBitsPerSecond)

      const oldVideoBitrate = this.config.recording.videoBitsPerSecond
      const oldAudioBitrate = this.config.recording.audioBitsPerSecond

      this.config.recording.videoBitsPerSecond = videoBitsPerSecond
      this.config.recording.audioBitsPerSecond = audioBitsPerSecond
      this.config.recording.quality = 'custom'

      this.emitChange('recording', 'videoBitsPerSecond', oldVideoBitrate, videoBitsPerSecond)
      this.emitChange('recording', 'audioBitsPerSecond', oldAudioBitrate, audioBitsPerSecond)
    }

    setRecordingIncludes = (options: { includeVideo?: boolean; includeAudio?: boolean; includeScreenShare?: boolean }) => {
      const updates: Partial<RecordingConfiguration> = {}

      if (options.includeVideo !== undefined) {
        updates.includeVideo = options.includeVideo
      }
      if (options.includeAudio !== undefined) {
        updates.includeAudio = options.includeAudio
      }
      if (options.includeScreenShare !== undefined) {
        updates.includeScreenShare = options.includeScreenShare
      }

      this.updateSection('recording', updates)
    }

    setRecordingLimits = (maxDuration: number, maxFileSize: number) => {
      this.validateAndSet('recording.maxDuration', maxDuration)
      this.validateAndSet('recording.maxFileSize', maxFileSize)

      const oldDuration = this.config.recording.maxDuration
      const oldFileSize = this.config.recording.maxFileSize

      this.config.recording.maxDuration = maxDuration
      this.config.recording.maxFileSize = maxFileSize

      this.emitChange('recording', 'maxDuration', oldDuration, maxDuration)
      this.emitChange('recording', 'maxFileSize', oldFileSize, maxFileSize)
    }

    toggleRecordingEnabled(): boolean {
      const newValue = !this.config.recording.enabled
      const oldValue = this.config.recording.enabled
      this.config.recording.enabled = newValue
      this.emitChange('recording', 'enabled', oldValue, newValue)
      return newValue
    }

    private updateSection<T extends keyof ValmConfiguration>(section: T, updates: Partial<ValmConfiguration[T]>): void {
      const oldConfig = this.deepClone(this.config[section])
      const entries = Object.entries(updates)

      entries.forEach(([key, value]) => {
        const path = `${section}.${key}`
        if (this.validators.has(path)) {
          this.validateAndSet(path, value)
        }
      })
      entries.forEach(([key, value]) => {
        ;(this.config[section] as any)[key] = value
      })

      this.emitChange(section, 'update', oldConfig, this.config[section])
    }

    resetRecordingConfig(): void {
      const oldConfig = this.deepClone(this.config.recording)
      this.config.recording = this.deepClone(this.getDefaultConfig().recording)
      this.emitChange('recording', 'reset', oldConfig, this.config.recording)
    }
  }
}

export interface RecordingEvents {
  recordingConfigChanged: (event: ConfigurationChangeEvent) => void
}
