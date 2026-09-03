import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    // Node >= 20.12 expone un `localStorage` global experimental que no admite
    // sobrescritura y devuelve `undefined` sin `--localstorage-file`. Sin este
    // flag, happy-dom no puede instalar su propio localStorage en el entorno
    // de pruebas y `window.localStorage` queda indefinido.
    execArgv: ['--no-experimental-webstorage'],
  },
})
