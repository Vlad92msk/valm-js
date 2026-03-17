import { TranscriptionConfiguration } from '../transcription/transcription.types'

export interface VideoConfiguration {
  /** Включено ли видео по умолчанию */
  enabled: boolean
  /** ID устройства камеры (null для автовыбора) */
  deviceId: string | null
  /** Разрешение видео */
  resolution: {
    /** Ширина в пикселях */
    width: number
    /** Высота в пикселях */
    height: number
  }
  /** Частота кадров в секунду */
  frameRate: number
  /** Направление камеры */
  facingMode: 'user' | 'environment'
  /** Дополнительные MediaTrackConstraints */
  constraints: MediaTrackConstraints
}

export interface AudioConfiguration {
  /** Включен ли звук по умолчанию */
  enabled: boolean
  /** ID аудиоустройства (null для автовыбора) */
  deviceId: string | null
  /** Включить подавление эха */
  echoCancellation: boolean
  /** Включить шумоподавление */
  noiseSuppression: boolean
  /** Включить автоматическую регулировку усиления */
  autoGainControl: boolean
  /** Включить детекцию речи */
  enableSpeakingDetection: boolean
  /** Порог громкости для детекции речи (0-100) */
  volumeThreshold: number
  constraints: MediaTrackConstraints
}

export interface ScreenShareConfiguration {
  /** Предпочтительная поверхность для захвата */
  preferDisplaySurface: 'monitor' | 'window' | 'application'
  /** Захватывать ли системный звук */
  includeAudio: boolean
  /** Максимальная ширина (undefined = без ограничений) */
  maxWidth?: number
  /** Максимальная высота (undefined = без ограничений) */
  maxHeight?: number
  /** Максимальная частота кадров (undefined = без ограничений) */
  maxFrameRate?: number
  // Подсказка кодеку: 'motion' — видео, 'detail' — презентации, 'text' — только текст
  contentHint?: 'motion' | 'detail' | 'text' | ''
}

export interface RecordingConfiguration {
  /** Включена ли запись по умолчанию */
  enabled: boolean
  /** Предпочтительный формат записи */
  format: 'webm' | 'mp4' | 'mkv'
  /** Качество записи */
  quality: 'low' | 'medium' | 'high' | 'custom'
  /** Битрейт видео (kbps) */
  videoBitsPerSecond: number
  /** Битрейт аудио (kbps) */
  audioBitsPerSecond: number
  /** Включать ли видео в запись */
  includeVideo: boolean
  /** Включать ли аудио в запись */
  includeAudio: boolean
  /** Включать ли скриншеринг в запись */
  includeScreenShare: boolean
  /** Автоматически сохранять файлы */
  autoSave: boolean
  /** Папка для сохранения (для автосохранения) */
  saveDirectory?: string
  /** Максимальная длительность записи (в минутах, 0 = без ограничений) */
  maxDuration: number
  /** Максимальный размер файла (в MB, 0 = без ограничений) */
  maxFileSize: number
  /** Интервал для создания чанков (в мс) */
  chunkInterval: number
}

export interface ValmConfiguration {
  video: VideoConfiguration
  audio: AudioConfiguration
  screenShare: ScreenShareConfiguration
  recording: RecordingConfiguration
  transcription: TranscriptionConfiguration
}
