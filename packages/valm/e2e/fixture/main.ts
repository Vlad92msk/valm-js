// Fixture entry: exposes the valm-js public API on `window` so Playwright can
// drive it via page.evaluate(...). The `@valm` / `@valm/effects` /
// `@valm/audio-effects` specifiers are resolved by vite aliases (see
// vite.config.ts) to either the built `dist/` or the raw `src/` depending on the
// VALM_SOURCE env var.
import * as Valm from '@valm'
import * as Effects from '@valm/effects'
import * as AudioEffects from '@valm/audio-effects'

declare global {
  interface Window {
    Valm: typeof import('../../src')
    Effects: typeof import('../../src/effects')
    AudioEffects: typeof import('../../src/audio-effects')
    valmReady: boolean
  }
}

window.Valm = Valm as unknown as typeof import('../../src')
window.Effects = Effects as unknown as typeof import('../../src/effects')
window.AudioEffects = AudioEffects as unknown as typeof import('../../src/audio-effects')
window.valmReady = true
