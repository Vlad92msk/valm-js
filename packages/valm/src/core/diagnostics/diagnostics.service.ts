import { CameraController } from '../media-stream/controllers/camera.controller'
import { MicrophoneController } from '../media-stream/controllers/microphone.controller'
import { AudioOutputController } from '../media-stream/controllers/audio-output.controller'
import { PermissionsService } from '../permissions/permissions.service'
import { VoiceActivityDetector } from '../utils/voice-activity-detector'
import {
  BrowserDiagnostics,
  CameraDiagnostics,
  DiagnosticsReport,
  DiagnosticsRunOptions,
  DiagnosticsStepCallback,
  DiagnosticsStepName,
  DiagnosticsStepStatus,
  MicrophoneDiagnostics,
  SpeakerDiagnostics,
} from './diagnostics.types'

// Pre-call диагностика: оркестрация существующих контроллеров с очисткой ресурсов после прогона
export class DiagnosticsService {
  private stepCallbacks = new Set<DiagnosticsStepCallback>()

  constructor(
    private permissions: PermissionsService,
    private camera: CameraController,
    private microphone: MicrophoneController,
    private audioOutput: AudioOutputController,
  ) {}

  async run(options: DiagnosticsRunOptions = { camera: true, microphone: true, speaker: true }): Promise<DiagnosticsReport> {
    const report: DiagnosticsReport = {
      browser: { supported: false, getUserMedia: false, getDisplayMedia: false },
      permissions: { camera: 'unknown', microphone: 'unknown' },
      camera: { ok: false },
      microphone: { ok: false },
      speaker: { ok: false, testPlayed: false },
    }

    this.emitStep('browser', 'running')
    report.browser = this.checkBrowser()
    this.emitStep('browser', report.browser.supported ? 'ok' : 'failed')

    this.emitStep('permissions', 'running')
    report.permissions = await this.permissions.checkAll()
    this.emitStep('permissions', 'ok')

    if (options.camera) {
      this.emitStep('camera', 'running')
      report.camera = await this.checkCamera()
      this.emitStep('camera', report.camera.ok ? 'ok' : 'failed')
    }

    if (options.microphone) {
      this.emitStep('microphone', 'running')
      report.microphone = await this.checkMicrophone()
      this.emitStep('microphone', report.microphone.ok ? 'ok' : 'failed')
    }

    if (options.speaker) {
      this.emitStep('speaker', 'running')
      report.speaker = await this.checkSpeaker()
      this.emitStep('speaker', report.speaker.ok ? 'ok' : 'failed')
    }

    return report
  }

  onStep(callback: DiagnosticsStepCallback): VoidFunction {
    this.stepCallbacks.add(callback)
    return () => this.stepCallbacks.delete(callback)
  }

  destroy(): void {
    this.stepCallbacks.clear()
  }

  private checkBrowser(): BrowserDiagnostics {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    const getUserMedia = !!md && typeof md.getUserMedia === 'function'
    const getDisplayMedia = !!md && typeof md.getDisplayMedia === 'function'
    return { supported: getUserMedia, getUserMedia, getDisplayMedia }
  }

  private async checkCamera(): Promise<CameraDiagnostics> {
    try {
      const track = await this.camera.preview()
      const settings = track.getSettings()
      const result: CameraDiagnostics = {
        ok: true,
        deviceLabel: track.label || undefined,
        resolution: settings.width && settings.height ? { width: settings.width, height: settings.height } : undefined,
      }
      this.camera.stopPreview()
      return result
    } catch (error) {
      this.camera.stopPreview()
      return { ok: false, error: this.errorMessage(error) }
    }
  }

  private async checkMicrophone(): Promise<MicrophoneDiagnostics> {
    try {
      const track = await this.microphone.preview()
      const peakVolume = await this.measurePeakVolume(track, 1500)
      const result: MicrophoneDiagnostics = {
        ok: true,
        deviceLabel: track.label || undefined,
        peakVolume,
      }
      this.microphone.stopPreview()
      return result
    } catch (error) {
      this.microphone.stopPreview()
      return { ok: false, error: this.errorMessage(error) }
    }
  }

  private async checkSpeaker(): Promise<SpeakerDiagnostics> {
    try {
      await this.audioOutput.playTestSound({ duration: 0.4 })
      return { ok: true, testPlayed: true }
    } catch (error) {
      return { ok: false, testPlayed: false, error: this.errorMessage(error) }
    }
  }

  // Пик громкости через VAD за ~1.5 с
  private measurePeakVolume(track: MediaStreamTrack, durationMs: number): Promise<number> {
    return new Promise<number>((resolve) => {
      const vad = new VoiceActivityDetector({ volumeThreshold: 0, silenceTimeout: 400 })
      let peak = 0

      const off = vad.onStateChange(({ volume }) => {
        if (volume > peak) peak = volume
      })

      vad.start(track)

      setTimeout(() => {
        off()
        vad.stop()
        resolve(Math.round(peak))
      }, durationMs)
    })
  }

  private emitStep(name: DiagnosticsStepName, status: DiagnosticsStepStatus): void {
    this.stepCallbacks.forEach((cb) => cb({ name, status }))
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }
}
