import path from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  root: 'src/client',
  plugins: [preact()],
  build: {
    outDir: path.resolve('dist/client'),
    emptyOutDir: true,
  },
})
