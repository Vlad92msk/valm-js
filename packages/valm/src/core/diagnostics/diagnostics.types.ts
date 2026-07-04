import { MediaPermissionState } from '../permissions/permissions.types'

export interface DiagnosticsRunOptions {
  camera?: boolean
  microphone?: boolean
  speaker?: boolean
}

export interface BrowserDiagnostics {
  supported: boolean
  getUserMedia: boolean
  getDisplayMedia: boolean
}

export interface CameraDiagnostics {
  ok: boolean
  deviceLabel?: string
  resolution?: { width: number; height: number }
  error?: string
}

export interface MicrophoneDiagnostics {
  ok: boolean
  deviceLabel?: string
  peakVolume?: number
  error?: string
}

export interface SpeakerDiagnostics {
  ok: boolean
  testPlayed: boolean
  error?: string
}

export interface DiagnosticsReport {
  browser: BrowserDiagnostics
  permissions: { camera: MediaPermissionState; microphone: MediaPermissionState }
  camera: CameraDiagnostics
  microphone: MicrophoneDiagnostics
  speaker: SpeakerDiagnostics
}

export type DiagnosticsStepName = 'browser' | 'permissions' | 'camera' | 'microphone' | 'speaker'
export type DiagnosticsStepStatus = 'running' | 'ok' | 'failed'

export interface DiagnosticsStep {
  name: DiagnosticsStepName
  status: DiagnosticsStepStatus
}

export type DiagnosticsStepCallback = (step: DiagnosticsStep) => void
