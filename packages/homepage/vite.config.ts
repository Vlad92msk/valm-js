import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@guides': new URL('../../guides', import.meta.url).pathname,
    },
  },
})
