import { DeviceDetector } from '../../core/utils/device-detector'
import { FaceMeshWorkerResult } from '../providers/face-mesh.client'
import { SegmentationResult } from '../providers/segmentation.client'
import { EffectFeature, IMLProvider, IVideoEffect } from '../types'

/**
 * Результат ML-детекции за один кадр
 */
export interface MLDetectionResult {
  segmentation: SegmentationResult | null
  faceMesh: FaceMeshWorkerResult | null
}

/**
 * Конфигурация кастомных провайдеров для EffectsPlugin
 */
export interface CustomProvidersConfig {
  segmentation?: IMLProvider<unknown, SegmentationResult>
  faceMesh?: IMLProvider<unknown, FaceMeshWorkerResult>
}

/**
 * MLProvidersManager — управление ML-провайдерами (сегментация, face mesh)
 *
 * Не создаёт провайдеры самостоятельно — они регистрируются извне
 * через registerProvider() или через EffectsPlugin({ providers: {...} }).
 *
 * Инкапсулирует:
 * - Регистрацию провайдеров
 * - Ленивую инициализацию при появлении эффектов
 * - Детекцию (segmentation, faceMesh) с возвратом кэша
 * - Освобождение провайдеров при удалении эффектов
 */
export class MLProvidersManager {
  private segmentationProvider: IMLProvider<unknown, SegmentationResult> | null = null
  private faceMeshProvider: IMLProvider<unknown, FaceMeshWorkerResult> | null = null
  private requiredFeatures: Set<EffectFeature> = new Set()

  /**
   * Зарегистрировать ML-провайдер для указанной фичи
   *
   * Заменяет предыдущий провайдер. Если старый провайдер инициализирован —
   * он будет освобождён.
   *
   * @example
   * ```typescript
   * manager.registerProvider(EffectFeature.SEGMENTATION, new SegmentationProvider({
   *   minInterval: 33,
   *   config: { delegate: 'GPU' }
   * }))
   * ```
   */
  registerProvider(feature: EffectFeature, provider: IMLProvider<unknown, unknown>): void {
    if (feature === EffectFeature.SEGMENTATION) {
      this.segmentationProvider?.dispose()
      this.segmentationProvider = provider as IMLProvider<unknown, SegmentationResult>
    } else if (feature === EffectFeature.FACE_MESH) {
      this.faceMeshProvider?.dispose()
      this.faceMeshProvider = provider as IMLProvider<unknown, FaceMeshWorkerResult>
    }
  }

  /**
   * Обновить набор требуемых фич на основе текущих эффектов
   */
  updateRequiredFeatures(effects: IVideoEffect[]): void {
    this.requiredFeatures.clear()

    for (const effect of effects) {
      for (const feature of effect.requiredFeatures) {
        this.requiredFeatures.add(feature)
      }
    }
  }

  /**
   * Инициализировать зарегистрированные провайдеры, которые требуются эффектам
   *
   * Провайдеры должны быть зарегистрированы через registerProvider() до вызова.
   * Если провайдер не зарегистрирован для требуемой фичи — она будет недоступна.
   */
  async initializeRequired(): Promise<void> {
    const promises: Promise<void>[] = []

    // Segmentation
    if (this.requiredFeatures.has(EffectFeature.SEGMENTATION) && this.segmentationProvider && !this.segmentationProvider.isReady()) {
      promises.push(this.segmentationProvider.initialize())
    }

    // FaceMesh
    if (this.requiredFeatures.has(EffectFeature.FACE_MESH) && this.faceMeshProvider && !this.faceMeshProvider.isReady()) {
      promises.push(this.faceMeshProvider.initialize())
    }

    if (promises.length === 0) return

    // На мобильных — общий таймаут инициализации
    const isMobile = DeviceDetector.isMobile()

    if (isMobile) {
      const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Provider initialization timeout')), 30000))

      try {
        await Promise.race([Promise.all(promises), timeout])
      } catch (error) {
        console.error('[MLProvidersManager] Таймаут инициализации на мобильном:', error)
      }
    } else {
      await Promise.all(promises)
    }
  }

  /**
   * Запустить детекцию у всех требуемых провайдеров
   */
  async detect(imageData: ImageData, timestamp: number): Promise<MLDetectionResult> {
    const [segmentation, faceMesh] = await Promise.all([this.detectSegmentation(imageData, timestamp), this.detectFaceMesh(imageData, timestamp)])

    return { segmentation, faceMesh }
  }

  /**
   * Получить кэшированные результаты (без запуска детекции)
   */
  getCachedResults(): MLDetectionResult {
    return {
      segmentation: this.segmentationProvider?.getLastResult() || null,
      faceMesh: this.faceMeshProvider?.getLastResult() || null,
    }
  }

  /**
   * Освободить провайдеры, которые больше не требуются эффектам
   */
  disposeUnused(): void {
    if (!this.requiredFeatures.has(EffectFeature.SEGMENTATION) && this.segmentationProvider) {
      this.segmentationProvider.dispose()
      this.segmentationProvider = null
    }

    if (!this.requiredFeatures.has(EffectFeature.FACE_MESH) && this.faceMeshProvider) {
      this.faceMeshProvider.dispose()
      this.faceMeshProvider = null
    }
  }

  /**
   * Освободить все ресурсы
   */
  dispose(): void {
    this.segmentationProvider?.dispose()
    this.segmentationProvider = null

    this.faceMeshProvider?.dispose()
    this.faceMeshProvider = null

    this.requiredFeatures.clear()
  }

  // ============================================
  // Private
  // ============================================

  private async detectSegmentation(imageData: ImageData, timestamp: number): Promise<SegmentationResult | null> {
    if (!this.requiredFeatures.has(EffectFeature.SEGMENTATION)) return null
    if (!this.segmentationProvider?.isReady()) return null

    try {
      return await this.segmentationProvider.detect(imageData, timestamp)
    } catch {
      return this.segmentationProvider.getLastResult()
    }
  }

  private async detectFaceMesh(imageData: ImageData, timestamp: number): Promise<FaceMeshWorkerResult | null> {
    if (!this.requiredFeatures.has(EffectFeature.FACE_MESH)) return null
    if (!this.faceMeshProvider?.isReady()) return null

    try {
      return await this.faceMeshProvider.detect(imageData, timestamp)
    } catch (error) {
      console.error('FaceMesh error:', error)
      return this.faceMeshProvider.getLastResult()
    }
  }
}
