import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
import { DeviceDetector } from '../../core/utils/device-detector'

/**
 * Конфигурация сегментации
 */
export interface SegmentationConfig {
  /** CPU или GPU (default: GPU на десктопе, CPU на мобильных) */
  delegate?: 'GPU' | 'CPU'
  /** Путь к WASM файлам MediaPipe */
  wasmPath?: string
  /** Путь к модели selfie_segmenter.tflite */
  modelPath?: string
  /** Принудительно отключить на мобильных */
  disableOnMobile?: boolean
}

/**
 * Результат сегментации
 */
export interface SegmentationResult {
  /** Маска: 0 = человек (foreground), 255 = фон (background) */
  maskData: Uint8Array
  /** Ширина маски */
  width: number
  /** Высота маски */
  height: number
  /** Timestamp кадра */
  timestamp: number
}

// Умные дефолтные настройки в зависимости от платформы
function getDefaultConfig(): Required<SegmentationConfig> {
  const isMobile = DeviceDetector.isMobile()
  const isIOS = DeviceDetector.isIOS()

  return {
    // На мобильных используем CPU (GPU часто работает нестабильно)
    delegate: isMobile ? 'CPU' : 'GPU',
    wasmPath: '/mediapipe/wasm',
    modelPath: '/mediapipe/models/selfie_segmenter.tflite',
    disableOnMobile: false,
  }
}

/**
 * SegmentationService — сегментация человека от фона через MediaPipe
 *
 * Оптимизирован для работы на мобильных устройствах:
 * - Автоматически использует CPU delegate на мобильных
 * - Обработка ошибок при недостатке памяти
 * - Fallback на пустую маску при проблемах
 */
export class SegmentationService {
  private segmenter: ImageSegmenter | null = null
  private initialized = false
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private lastTimestamp = 0
  private initializationError: Error | null = null
  private isMobile = false
  private isIOS = false
  private pendingSegmentations = 0

  /**
   * Инициализация MediaPipe ImageSegmenter
   */
  async initialize(config: SegmentationConfig = {}): Promise<void> {
    if (this.initialized) {
      console.warn('[SegmentationService] Already initialized')
      return
    }

    this.isMobile = DeviceDetector.isMobile()
    this.isIOS = DeviceDetector.isIOS()

    // Проверка: может быть отключено на мобильных
    if (config.disableOnMobile && this.isMobile) {
      this.initializationError = new Error('Disabled on mobile')
      return
    }

    const defaultConfig = getDefaultConfig()
    const finalConfig = { ...defaultConfig, ...config }

    try {
      // Загружаем WASM с таймаутом
      const visionPromise = FilesetResolver.forVisionTasks(finalConfig.wasmPath)
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('WASM load timeout')), 15000))

      const vision = (await Promise.race([visionPromise, timeoutPromise])) as any

      // Создаём segmenter
      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: finalConfig.modelPath,
          delegate: finalConfig.delegate,
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      })

      this.initialized = true
    } catch (error) {
      console.error('[SegmentationService] Initialization failed:', error)
      this.initializationError = error as Error

      // На мобильных НЕ бросаем ошибку, просто логируем
      if (!this.isMobile) {
        throw error
      }
    }
  }

  /**
   * Выполнить сегментацию
   */
  async segment(imageData: ImageData, timestamp: number): Promise<SegmentationResult> {
    // Если не инициализирован или есть ошибка — возвращаем пустую маску
    if (!this.segmenter || !this.initialized || this.initializationError) {
      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }

    // На мобильных не накапливаем pending вызовы MediaPipe:
    // если предыдущий segmentForVideo ещё выполняется (но timeout уже сработал),
    // пропускаем новый вызов вместо накопления "призраков"
    if (this.isMobile && this.pendingSegmentations > 0) {
      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }

    try {
      // Создаём canvas для ImageData если нужно
      this.ensureCanvas(imageData.width, imageData.height)

      if (!this.ctx || !this.canvas) {
        throw new Error('Failed to create canvas context')
      }

      // Рисуем ImageData на canvas
      this.ctx.putImageData(imageData, 0, 0)

      // Используем монотонно возрастающий timestamp
      this.lastTimestamp = Math.max(this.lastTimestamp + 1, Math.floor(timestamp))

      // segmentForVideo — синхронный вызов, возвращает результат напрямую
      this.pendingSegmentations++
      const result = this.segmenter.segmentForVideo(this.canvas, this.lastTimestamp)
      this.pendingSegmentations--

      // Извлекаем маску
      const confidenceMasks = result.confidenceMasks

      if (!confidenceMasks || confidenceMasks.length === 0) {
        result.close()
        return this.getEmptyMask(imageData.width, imageData.height, timestamp)
      }

      // Берём первую маску
      const confidenceMask = confidenceMasks[0]

      // Конвертируем Float32Array маску в нужный формат
      const maskData = this.convertConfidenceMask(confidenceMask, imageData.width, imageData.height)

      // Освобождаем ресурсы MediaPipe
      result.close()

      return {
        maskData,
        width: imageData.width,
        height: imageData.height,
        timestamp,
      }
    } catch (error) {
      this.pendingSegmentations = Math.max(0, this.pendingSegmentations - 1)
      console.error('[SegmentationService] Segmentation error:', error)

      // При ошибке возвращаем пустую маску вместо падения
      return this.getEmptyMask(imageData.width, imageData.height, timestamp)
    }
  }

  /**
   * Освободить ресурсы
   */
  dispose(): void {
    if (this.segmenter) {
      try {
        this.segmenter.close()
      } catch (error) {
        console.error('[SegmentationService] Dispose error:', error)
      }
      this.segmenter = null
    }

    this.canvas = null
    this.ctx = null
    this.initialized = false
    this.initializationError = null
    this.pendingSegmentations = 0
  }

  /**
   * Проверить готовность
   */
  isReady(): boolean {
    return this.initialized && !this.initializationError
  }

  /**
   * Получить информацию об ошибке инициализации
   */
  getInitializationError(): Error | null {
    return this.initializationError
  }

  // ============================================
  // Private
  // ============================================

  /**
   * Вернуть пустую маску (всё фон)
   */
  private getEmptyMask(width: number, height: number, timestamp: number): SegmentationResult {
    const emptyMask = new Uint8Array(width * height)
    emptyMask.fill(255) // Весь кадр = фон

    return {
      maskData: emptyMask,
      width,
      height,
      timestamp,
    }
  }

  private ensureCanvas(width: number, height: number): void {
    if (this.canvas && this.canvas.width === width && this.canvas.height === height) {
      return
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false, // Оптимизация для мобильных
    })
  }

  /**
   * Конвертация confidence mask MediaPipe в Uint8Array
   */
  private convertConfidenceMask(
    confidenceMask: {
      getAsFloat32Array(): Float32Array
      getAsUint8Array?(): Uint8Array
      width: number
      height: number
    },
    width: number,
    height: number,
  ): Uint8Array {
    const length = width * height
    const result = new Uint8Array(length)

    // Получаем Float32Array с confidence values (0.0 - 1.0)
    const rawMask = confidenceMask.getAsFloat32Array()

    // Порог для бинаризации
    const threshold = 0.5

    for (let i = 0; i < length; i++) {
      const confidence = rawMask[i]
      // Если confidence > threshold (person), ставим 0
      // Если confidence <= threshold (background), ставим 255
      result[i] = confidence > threshold ? 0 : 255
    }

    return result
  }
}
