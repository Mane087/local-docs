import path from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  root: 'src/client',
  plugins: [preact()],
  build: {
    outDir: path.resolve('dist/client'),
    emptyOutDir: true,
    // El servidor reserva /assets/ para los recursos de la documentacion del
    // usuario, asi que los del propio visor se emiten bajo otra carpeta: si
    // colisionan, el servidor busca el javascript del cliente dentro de docs/,
    // devuelve 404 y la pagina queda en blanco.
    assetsDir: 'app',
  },
})
