/// <reference types="vite/client" />

// Версия ядра valm, подставляется через vite define (см. vite.config.ts).
declare const __VALM_VERSION__: string

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string }
  export default classes
}
