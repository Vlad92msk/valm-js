import { ConfigurationService } from '../../configuration'
import { RecordingOptions, RecordingService, RecordingState } from '../recording.service'

export interface RecordingUtils {
  downloadBlob: (blob: Blob, filename?: string) => void
  createObjectURL: (blob: Blob) => string
  uploadBlob: (blob: Blob, endpoint: string) => Promise<Response>
  saveToIndexedDB: (blob: Blob, key: string) => Promise<void>
  getFileExtension: (mimeType: string) => string
}

export type RecordingStoppedCallback = (blob: Blob, utils: RecordingUtils) => void
export type RecordingDataCallback = (data: { chunk: Blob; totalSize: number; duration: number }) => void
export type RecordingLimitCallback = (data: { type: 'duration' | 'fileSize'; limit: number }) => void

export class RecordingController {
  private stateCallbacks = new Set<(state: RecordingState) => void>()
  private errorCallbacks = new Set<(error: any) => void>()
  private recordingStoppedCallbacks = new Set<RecordingStoppedCallback>()
  private recordingDataCallbacks = new Set<RecordingDataCallback>()
  private recordingLimitCallbacks = new Set<RecordingLimitCallback>()

  private unsubscribes: VoidFunction[] = []

  private utils: RecordingUtils

  constructor(
    private configService: ConfigurationService,
    private recordingService: RecordingService,
  ) {
    this.setupEventListeners()
    this.utils = this.createUtils()
  }

  private createUtils(): RecordingUtils {
    return {
      downloadBlob: (blob: Blob, filename?: string) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || this.generateFilename(blob.type)
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      },

      createObjectURL: (blob: Blob) => {
        return URL.createObjectURL(blob)
      },

      uploadBlob: async (blob: Blob, endpoint: string) => {
        const formData = new FormData()
        formData.append('recording', blob, this.generateFilename(blob.type))

        return fetch(endpoint, {
          method: 'POST',
          body: formData,
        })
      },

      saveToIndexedDB: async (blob: Blob, key: string) => {
        // Простая реализация для IndexedDB
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('recordings', 1)

          request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('files')) {
              db.createObjectStore('files')
            }
          }

          request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(['files'], 'readwrite')
            const store = transaction.objectStore('files')
            store.put(blob, key)

            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error)
          }

          request.onerror = () => reject(request.error)
        })
      },

      getFileExtension: (mimeType: string) => {
        if (mimeType.includes('webm')) return 'webm'
        if (mimeType.includes('mp4')) return 'mp4'
        if (mimeType.includes('matroska')) return 'mkv'
        return 'webm'
      },
    }
  }

  private generateFilename(mimeType: string): string {
    const extension = this.utils.getFileExtension(mimeType)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `recording-${timestamp}.${extension}`
  }

  private setupEventListeners(): void {
    this.unsubscribes.push(
      this.recordingService.on('recordingStarted', (state) => this._notifyStateChange(state)),
      this.recordingService.on('recordingStopped', (blob) => {
        this.handleRecordingComplete(blob)
        this._notifyStateChange(this.recordingService.getState())
      }),
      this.recordingService.on('recordingPaused', (state) => this._notifyStateChange(state)),
      this.recordingService.on('recordingResumed', (state) => this._notifyStateChange(state)),
      this.recordingService.on('recordingData', (data) => this._notifyRecordingData(data)),
      this.recordingService.on('recordingLimitReached', (data) => this._notifyRecordingLimit(data)),
      this.recordingService.on('recordingError', (error) => this._notifyError(error)),
    )
  }

  destroy(): void {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.stateCallbacks.clear()
    this.errorCallbacks.clear()
    this.recordingStoppedCallbacks.clear()
    this.recordingDataCallbacks.clear()
    this.recordingLimitCallbacks.clear()
  }

  startRecording = async (options?: RecordingOptions): Promise<void> => {
    await this.recordingService.startRecording(options)
  }

  stopRecording = async (): Promise<Blob> => {
    return this.recordingService.stopRecording()
  }

  pauseRecording = (): void => {
    this.recordingService.pauseRecording()
  }

  resumeRecording = (): void => {
    this.recordingService.resumeRecording()
  }

  onStateChange = (callback: (state: RecordingState) => void): VoidFunction => {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onError = (callback: (error: any) => void): VoidFunction => {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  onRecordingStopped = (callback: RecordingStoppedCallback): VoidFunction => {
    this.recordingStoppedCallbacks.add(callback)
    return () => this.recordingStoppedCallbacks.delete(callback)
  }

  onRecordingData = (callback: RecordingDataCallback): VoidFunction => {
    this.recordingDataCallbacks.add(callback)
    return () => this.recordingDataCallbacks.delete(callback)
  }

  onRecordingLimitReached = (callback: RecordingLimitCallback): VoidFunction => {
    this.recordingLimitCallbacks.add(callback)
    return () => this.recordingLimitCallbacks.delete(callback)
  }

  private handleRecordingComplete(blob: Blob): void {
    const config = this.configService.getRecordingConfig()

    // Автоматическое скачивание если включено
    if (config.autoSave) {
      this.utils.downloadBlob(blob)
    }

    // Уведомляем подписчиков
    this._notifyRecordingStopped(blob)
  }

  private _notifyStateChange(state: RecordingState): void {
    this.stateCallbacks.forEach((callback) => callback(state))
  }

  private _notifyError(error: any): void {
    this.errorCallbacks.forEach((callback) => callback(error))
  }

  private _notifyRecordingStopped(blob: Blob): void {
    this.recordingStoppedCallbacks.forEach((callback) => callback(blob, this.utils))
  }

  private _notifyRecordingData(data: { chunk: Blob; totalSize: number; duration: number }): void {
    this.recordingDataCallbacks.forEach((callback) => callback(data))
  }

  private _notifyRecordingLimit(data: { type: 'duration' | 'fileSize'; limit: number }): void {
    this.recordingLimitCallbacks.forEach((callback) => callback(data))
  }

  get state(): RecordingState {
    return this.recordingService.getState()
  }
}
