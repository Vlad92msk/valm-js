import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

/**
 * Типы сообщений для будущей коммуникации с воркером
 */
export enum WorkerMessageType {
  INIT = 'init',
  INIT_SUCCESS = 'init_success',
  INIT_ERROR = 'init_error',
  DETECT = 'detect',
  DETECT_SUCCESS = 'detect_success',
  DETECT_ERROR = 'detect_error',
  DISPOSE = 'dispose',
}

export interface WorkerMessage {
  type: WorkerMessageType
  id: string
  data?: unknown
}

/**
 * Конфигурация FaceMesh
 */
export interface FaceMeshWorkerConfig {
  /** Путь к модели face_landmarker.task */
  modelPath?: string
  /** Путь к папке с WASM файлами MediaPipe */
  wasmPath?: string
  /** CPU или GPU (default: GPU) */
  delegate?: 'CPU' | 'GPU'
  /** Количество лиц для детекции (default: 1) */
  numFaces?: number
}

/**
 * Одна точка лица (normalized 0-1)
 */
export interface FaceLandmark {
  x: number
  y: number
  z?: number
}

/**
 * Результат детекции лица
 */
export interface FaceMeshWorkerResult {
  /** 478 точек лица (normalized 0-1) или null если лицо не найдено */
  landmarks: FaceLandmark[] | null
  /** 4x4 матрица трансформации для 3D эффектов */
  transformationMatrix: number[] | null
  /** Timestamp кадра */
  timestamp: number
}

const DEFAULT_CONFIG: Required<FaceMeshWorkerConfig> = {
  delegate: 'GPU',
  wasmPath: '/mediapipe/wasm',
  modelPath: '/mediapipe/models/face_landmarker.task',
  numFaces: 1,
}

/**
 * FaceMeshClient — детекция лица через MediaPipe FaceLandmarker
 *
 * Пока работает в main thread. Позже перенесём в Worker.
 *
 * @example
 * ```typescript
 * const client = new FaceMeshClient()
 * await client.initialize({ delegate: 'GPU', numFaces: 1 })
 *
 * const result = await client.detect(imageData, performance.now())
 * if (result.landmarks) {
 *   console.log('Found face with', result.landmarks.length, 'landmarks')
 * }
 *
 * client.dispose()
 * ```
 */
export class FaceMeshClient {
  private faceLandmarker: FaceLandmarker | null = null
  private initialized = false
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  /**
   * Инициализация MediaPipe FaceLandmarker
   */
  async initialize(config: FaceMeshWorkerConfig = {}): Promise<void> {
    if (this.initialized) {
      console.warn('FaceMeshClient already initialized')
      return
    }

    const finalConfig = { ...DEFAULT_CONFIG, ...config }

    try {
      // Загружаем WASM
      const vision = await FilesetResolver.forVisionTasks(finalConfig.wasmPath)

      // Создаём face landmarker
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: finalConfig.modelPath,
          delegate: finalConfig.delegate,
        },
        runningMode: 'VIDEO',
        numFaces: finalConfig.numFaces,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      })

      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize FaceMeshClient:', error)
      throw error
    }
  }

  /**
   * Детекция лица
   */
  async detect(imageData: ImageData, timestamp: number): Promise<FaceMeshWorkerResult> {
    if (!this.faceLandmarker || !this.initialized) {
      throw new Error('FaceMeshClient not initialized')
    }

    // Создаём canvas для ImageData если нужно
    this.ensureCanvas(imageData.width, imageData.height)

    if (!this.ctx || !this.canvas) {
      throw new Error('Failed to create canvas context')
    }

    // Рисуем ImageData на canvas
    this.ctx.putImageData(imageData, 0, 0)

    // Запускаем детекцию
    const result = this.faceLandmarker.detectForVideo(this.canvas, timestamp)

    // Если лиц не найдено
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        landmarks: null,
        transformationMatrix: null,
        timestamp,
      }
    }

    // Берём первое лицо
    const firstFace = result.faceLandmarks[0]

    // Конвертируем landmarks
    const landmarks: FaceLandmark[] = firstFace.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
    }))

    // Получаем матрицу трансформации
    let transformationMatrix: number[] | null = null

    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      const matrix = result.facialTransformationMatrixes[0]
      // Matrix4x4 -> flat array
      transformationMatrix = Array.from(matrix.data)
    }

    return {
      landmarks,
      transformationMatrix,
      timestamp,
    }
  }

  /**
   * Освободить ресурсы
   */
  dispose(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close()
      this.faceLandmarker = null
    }

    this.canvas = null
    this.ctx = null
    this.initialized = false
  }

  /**
   * Проверить готовность
   */
  isReady(): boolean {
    return this.initialized
  }

  // ============================================
  // Private
  // ============================================

  private ensureCanvas(width: number, height: number): void {
    if (this.canvas && this.canvas.width === width && this.canvas.height === height) {
      return
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d')
  }
}
