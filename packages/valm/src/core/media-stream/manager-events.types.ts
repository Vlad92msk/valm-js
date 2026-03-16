import { MediaStreamState } from './media.types'

export interface ValmEvents extends Record<string, (...args: any[]) => void> {
  error: (error: { source: string; error: any }) => void
  videoDisabled: VoidFunction
  audioDisabled: VoidFunction
  mediaReset: VoidFunction
  videoStateChanged: (mediaState: MediaStreamState) => void
  audioStateChanged: (mediaState: MediaStreamState) => void
}
