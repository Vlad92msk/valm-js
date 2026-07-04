import type { Page } from '@playwright/test'

/** Сериализуемый снимок MediaStreamTrack — то, что можно вытащить из браузера в тест. */
export interface TrackInfo {
  exists: boolean
  kind: string
  readyState: string
  enabled: boolean
  muted: boolean
  label: string
  settings: MediaTrackSettings
}

/**
 * Снять информацию о треке из потока, лежащего в браузере.
 * `path` — выражение над window, возвращающее MediaStream | MediaStreamTrack | null.
 * Пример: "window.__valm.cameraController.getTrack()".
 */
export async function inspectTrack(page: Page, expr: string): Promise<TrackInfo> {
  return page.evaluate((e) => {
    // eslint-disable-next-line no-new-func
    const val = new Function(`return (${e})`)()
    let track: MediaStreamTrack | null = null
    if (val && typeof (val as MediaStream).getTracks === 'function') {
      track = (val as MediaStream).getTracks()[0] ?? null
    } else if (val && 'kind' in val) {
      track = val as MediaStreamTrack
    }
    if (!track) {
      return { exists: false, kind: '', readyState: '', enabled: false, muted: false, label: '', settings: {} }
    }
    return {
      exists: true,
      kind: track.kind,
      readyState: track.readyState,
      enabled: track.enabled,
      muted: track.muted,
      label: track.label,
      settings: track.getSettings(),
    }
  }, expr)
}

/** Количество треков заданного kind в потоке (или -1 если поток null). */
export async function countTracks(page: Page, streamExpr: string, kind?: 'audio' | 'video'): Promise<number> {
  return page.evaluate(
    ({ e, k }) => {
      // eslint-disable-next-line no-new-func
      const stream = new Function(`return (${e})`)() as MediaStream | null
      if (!stream) return -1
      const tracks = k ? stream.getTracks().filter((t) => t.kind === k) : stream.getTracks()
      return tracks.length
    },
    { e: streamExpr, k: kind },
  )
}
