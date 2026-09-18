import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    // Vite inlinea los SVG pequenos como data URI tambien en modo dev. Los
    // tests comprueban que icono se muestra por el nombre del archivo en el
    // src, asi que aqui se desactiva el inlining. No afecta al build real,
    // que usa vite.config.ts.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
    // Ver tests/setup-local-storage.ts: reemplaza el localStorage global para
    // que sea independiente de la version de Node.
    setupFiles: ['./tests/setup-local-storage.ts'],
  },
})
