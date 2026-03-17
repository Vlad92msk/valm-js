import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Для будущей коммуникации с воркером
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

export interface FaceMeshWorkerConfig {
  modelPath?: string
  wasmPath?: string
  // default: GPU
  delegate?: 'CPU' | 'GPU'
  // default: 1
  numFaces?: number
}

// normalized 0–1
export interface FaceLandmark {
  x: number
  y: number
  z?: number
}

export interface FaceMeshWorkerResult {
  // 478 точек лица (normalized 0–1), null если лицо не найдено
  landmarks: FaceLandmark[] | null
  // 4x4 матрица трансформации для 3D эффектов
  transformationMatrix: number[] | null
  timestamp: number
}

const DEFAULT_CONFIG: Required<FaceMeshWorkerConfig> = {
  delegate: 'GPU',
  wasmPath: '/mediapipe/wasm',
  modelPath: '/mediapipe/models/face_landmarker.task',
  numFaces: 1,
}

// Пока main thread, позже перенесём в Worker
export class FaceMeshClient {
  private faceLandmarker: FaceLandmarker | null = null
  private initialized = false
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  async initialize(config: FaceMeshWorkerConfig = {}): Promise<void> {
    if (this.initialized) {
      console.warn('FaceMeshClient already initialized')
      return
    }

    const finalConfig = { ...DEFAULT_CONFIG, ...config }

    try {
      const vision = await FilesetResolver.forVisionTasks(finalConfig.wasmPath)

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

  async detect(imageData: ImageData, timestamp: number): Promise<FaceMeshWorkerResult> {
    if (!this.faceLandmarker || !this.initialized) {
      throw new Error('FaceMeshClient not initialized')
    }

    this.ensureCanvas(imageData.width, imageData.height)

    if (!this.ctx || !this.canvas) {
      throw new Error('Failed to create canvas context')
    }

    this.ctx.putImageData(imageData, 0, 0)

    const result = this.faceLandmarker.detectForVideo(this.canvas, timestamp)

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        landmarks: null,
        transformationMatrix: null,
        timestamp,
      }
    }

    const firstFace = result.faceLandmarks[0]

    const landmarks: FaceLandmark[] = firstFace.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
    }))

    let transformationMatrix: number[] | null = null

    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      const matrix = result.facialTransformationMatrixes[0]
      transformationMatrix = Array.from(matrix.data)
    }

    return {
      landmarks,
      transformationMatrix,
      timestamp,
    }
  }

  dispose(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close()
      this.faceLandmarker = null
    }

    this.canvas = null
    this.ctx = null
    this.initialized = false
  }

  isReady(): boolean {
    return this.initialized
  }

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
