import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({ tsconfigPath: './tsconfig.build.json', outDir: 'dist', entryRoot: 'src', afterDiagnostic: () => {} })
  ],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        effects: 'src/effects/index.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'eventemitter3',
        '@mediapipe/tasks-vision',
      ],
      output: {
        // Стабильные имена точек входа: dist/index.js, dist/effects.js
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    target: 'ES2022',
    sourcemap: true,
    minify: false,
  },
})
