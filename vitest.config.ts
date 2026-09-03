import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    // Ver tests/setup-local-storage.ts: reemplaza el localStorage global para
    // que sea independiente de la version de Node.
    setupFiles: ['./tests/setup-local-storage.ts'],
  },
})
