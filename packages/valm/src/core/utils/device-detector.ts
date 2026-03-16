/**
 * Unified device detection utility.
 * Single source of truth for platform/browser checks across the module.
 */
export const DeviceDetector = {
  isMobile(): boolean {
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.screen.width < 1024

    return isMobileUA || (hasTouch && isSmallScreen)
  },

  isIOS(): boolean {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  },

  isAndroid(): boolean {
    return /Android/i.test(navigator.userAgent)
  },

  isDesktop(): boolean {
    return !this.isMobile()
  },

  isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  },

  isSafari(): boolean {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  },

  isIOSSafari(): boolean {
    const ua = navigator.userAgent
    return this.isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua)
  },

  isIOSChrome(): boolean {
    return this.isIOS() && /CriOS/.test(navigator.userAgent)
  },
}
