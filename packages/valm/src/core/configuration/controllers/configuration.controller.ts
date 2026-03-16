// controllers/configuration.controller.ts
import {
  ConfigurationChangeEvent,
  AudioConfiguration,
  ValmConfiguration,
  RecordingConfiguration,
  ScreenShareConfiguration,
  VideoConfiguration,
} from '../../types'
import { ConfigurationService } from '../configuration.service'
import { TranscriptionConfiguration } from '../../transcription/transcription.types'

export type ConfigurationChangeCallback = (event: ConfigurationChangeEvent) => void
export type ConfigurationUpdateCallback = (data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => void
export type ConfigurationResetCallback = (data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => void
export type ConfigurationImportCallback = (data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }) => void

export class ConfigurationController {
  private changeCallbacks = new Set<ConfigurationChangeCallback>()
  private updateCallbacks = new Set<ConfigurationUpdateCallback>()
  private resetCallbacks = new Set<ConfigurationResetCallback>()
  private importCallbacks = new Set<ConfigurationImportCallback>()

  // Specialized event callbacks
  private videoChangeCallbacks = new Set<ConfigurationChangeCallback>()
  private audioChangeCallbacks = new Set<ConfigurationChangeCallback>()
  private screenShareChangeCallbacks = new Set<ConfigurationChangeCallback>()
  private recordingChangeCallbacks = new Set<ConfigurationChangeCallback>()
  private transcriptionChangeCallbacks = new Set<ConfigurationChangeCallback>()

  private unsubscribers: VoidFunction[] = []

  constructor(private configService: ConfigurationService) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.unsubscribers.push(
      this.configService.on('configurationChanged', (event) => {
        this._notifyChange(event)

        switch (event.section) {
          case 'video':
            this._notifyVideoChange(event)
            break
          case 'audio':
            this._notifyAudioChange(event)
            break
          case 'screenShare':
            this._notifyScreenShareChange(event)
            break
          case 'recording':
            this._notifyRecordingChange(event)
            break
          case 'transcription':
            this._notifyTranscriptionChange(event)
            break
        }
      }),
      this.configService.on('configReset', (data) => {
        this._notifyReset(data)
      }),
      this.configService.on('configImported', (data) => {
        this._notifyImport(data)
      }),
    )
  }

  destroy = (): void => {
    this.unsubscribers.forEach((unsub) => unsub())
    this.unsubscribers = []
    this.changeCallbacks.clear()
    this.updateCallbacks.clear()
    this.resetCallbacks.clear()
    this.importCallbacks.clear()
    this.videoChangeCallbacks.clear()
    this.audioChangeCallbacks.clear()
    this.screenShareChangeCallbacks.clear()
    this.recordingChangeCallbacks.clear()
    this.transcriptionChangeCallbacks.clear()
  }

  getConfig = (): ValmConfiguration => {
    return this.configService.getConfig()
  }

  getVideoConfig = (): VideoConfiguration => {
    return this.configService.getVideoConfig()
  }

  getAudioConfig = (): AudioConfiguration => {
    return this.configService.getAudioConfig()
  }

  getScreenShareConfig = (): ScreenShareConfiguration => {
    return this.configService.getScreenShareConfig()
  }

  getRecordingConfig = (): RecordingConfiguration => {
    return this.configService.getRecordingConfig()
  }

  getTranscriptionConfig = (): TranscriptionConfiguration => {
    return this.configService.getTranscriptionConfig()
  }

  updateVideoConfig = (updates: Partial<VideoConfiguration>): void => {
    this.configService.updateVideoConfig(updates)
  }

  updateAudioConfig = (updates: Partial<AudioConfiguration>): void => {
    this.configService.updateAudioConfig(updates)
  }

  updateScreenShareConfig = (updates: Partial<ScreenShareConfiguration>): void => {
    this.configService.updateScreenShareConfig(updates)
  }

  updateRecordingConfig = (updates: Partial<RecordingConfiguration>): void => {
    this.configService.updateRecordingConfig(updates)
  }

  updateTranscriptionConfig = (updates: Partial<TranscriptionConfiguration>): void => {
    this.configService.updateTranscriptionConfig(updates)
  }

  setVideoResolution = (width: number, height: number): void => {
    this.configService.setVideoResolution(width, height)
  }

  setVideoFrameRate = (frameRate: number): void => {
    this.configService.setVideoFrameRate(frameRate)
  }

  setVideoDevice = (deviceId: string | null): void => {
    this.configService.setVideoDevice(deviceId)
  }

  toggleVideoEnabled = (): boolean => {
    return this.configService.toggleVideoEnabled()
  }

  setAudioDevice = (deviceId: string | null): void => {
    this.configService.setAudioDevice(deviceId)
  }

  setAudioProcessing = (options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean }): void => {
    this.configService.setAudioProcessing(options)
  }

  toggleAudioEnabled = (): boolean => {
    return this.configService.toggleAudioEnabled()
  }

  // Transcription methods
  setTranscriptionLanguage = (language: string): void => {
    this.configService.setTranscriptionLanguage(language)
  }

  toggleTranscriptionEnabled = (): boolean => {
    return this.configService.toggleTranscriptionEnabled()
  }

  toggleTranscriptionAutoStart = (): boolean => {
    return this.configService.toggleAutoStart()
  }

  setRecordingFormat = (format: 'webm' | 'mp4' | 'mkv'): void => {
    this.configService.setRecordingFormat(format)
  }

  setRecordingQuality = (quality: 'low' | 'medium' | 'high' | 'custom'): void => {
    this.configService.setRecordingQuality(quality)
  }

  setRecordingBitrates = (videoBitsPerSecond: number, audioBitsPerSecond: number): void => {
    this.configService.setRecordingBitrates(videoBitsPerSecond, audioBitsPerSecond)
  }

  setRecordingIncludes = (options: { includeVideo?: boolean; includeAudio?: boolean; includeScreenShare?: boolean }): void => {
    this.configService.setRecordingIncludes(options)
  }

  setRecordingLimits = (maxDuration: number, maxFileSize: number): void => {
    this.configService.setRecordingLimits(maxDuration, maxFileSize)
  }

  toggleRecordingEnabled = (): boolean => {
    return this.configService.toggleRecordingEnabled()
  }

  resetVideoConfig = (): void => {
    this.configService.resetVideoConfig()
  }

  resetAudioConfig = (): void => {
    this.configService.resetAudioConfig()
  }

  resetRecordingConfig = (): void => {
    this.configService.resetRecordingConfig()
  }

  resetTranscriptionConfig = (): void => {
    this.configService.resetTranscriptionConfig()
  }

  resetAll = (): void => {
    this.configService.resetAll()
  }

  exportConfig = (): string => {
    return this.configService.exportConfig()
  }

  importConfig = (configJson: string): void => {
    this.configService.importConfig(configJson)
  }

  onChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.changeCallbacks.add(callback)
    return () => this.changeCallbacks.delete(callback)
  }

  onUpdate = (callback: ConfigurationUpdateCallback): VoidFunction => {
    this.updateCallbacks.add(callback)
    return () => this.updateCallbacks.delete(callback)
  }

  onReset = (callback: ConfigurationResetCallback): VoidFunction => {
    this.resetCallbacks.add(callback)
    return () => this.resetCallbacks.delete(callback)
  }

  onImport = (callback: ConfigurationImportCallback): VoidFunction => {
    this.importCallbacks.add(callback)
    return () => this.importCallbacks.delete(callback)
  }

  onVideoChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.videoChangeCallbacks.add(callback)
    return () => this.videoChangeCallbacks.delete(callback)
  }

  onAudioChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.audioChangeCallbacks.add(callback)
    return () => this.audioChangeCallbacks.delete(callback)
  }

  onScreenShareChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.screenShareChangeCallbacks.add(callback)
    return () => this.screenShareChangeCallbacks.delete(callback)
  }

  onRecordingChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.recordingChangeCallbacks.add(callback)
    return () => this.recordingChangeCallbacks.delete(callback)
  }

  onTranscriptionChange = (callback: ConfigurationChangeCallback): VoidFunction => {
    this.transcriptionChangeCallbacks.add(callback)
    return () => this.transcriptionChangeCallbacks.delete(callback)
  }

  private _notifyChange(event: ConfigurationChangeEvent): void {
    this.changeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyVideoChange(event: ConfigurationChangeEvent): void {
    this.videoChangeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyAudioChange(event: ConfigurationChangeEvent): void {
    this.audioChangeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyScreenShareChange(event: ConfigurationChangeEvent): void {
    this.screenShareChangeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyRecordingChange(event: ConfigurationChangeEvent): void {
    this.recordingChangeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyTranscriptionChange(event: ConfigurationChangeEvent): void {
    this.transcriptionChangeCallbacks.forEach((callback) => callback(event))
  }

  private _notifyReset(data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }): void {
    this.resetCallbacks.forEach((callback) => callback(data))
  }

  private _notifyImport(data: { oldConfig: ValmConfiguration; newConfig: ValmConfiguration }): void {
    this.importCallbacks.forEach((callback) => callback(data))
  }
}
