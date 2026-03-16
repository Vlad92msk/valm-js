import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({ tsconfigPath: './tsconfig.build.json', outDir: 'dist', entryRoot: 'src', afterDiagnostic: () => {} })
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'eventemitter3',
        '@mediapipe/tasks-vision',
      ],
    },
    target: 'ES2022',
    sourcemap: true,
    minify: false,
  },
})
