import { describe, expect, it } from 'vitest'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

// El servidor reserva la ruta /assets/ para los recursos de la documentacion del
// usuario y la resuelve contra docs/, no contra el cliente compilado. Si Vite
// emite ahi el javascript del visor, el servidor responde 404 a su propio
// cliente y la pagina queda en blanco sin ningun error visible en la terminal.
const CLIENTE_COMPILADO = path.resolve('dist/client/index.html')
const hayCompilado = fsSync.existsSync(CLIENTE_COMPILADO)

describe('recursos del cliente compilado', () => {
  it('la configuracion de Vite no emite bajo la ruta reservada para la documentacion', async () => {
    const configuracion = await fs.readFile(path.resolve('vite.config.ts'), 'utf8')

    expect(configuracion).toMatch(/assetsDir:\s*'(?!assets')[^']+'/)
  })

  it.skipIf(!hayCompilado)('el html publicado no pide nada bajo la ruta reservada', async () => {
    const html = await fs.readFile(CLIENTE_COMPILADO, 'utf8')
    const referencias = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((coincidencia) => coincidencia[1])

    expect(referencias.length).toBeGreaterThan(0)
    for (const referencia of referencias) {
      expect(referencia?.startsWith('/assets/')).toBe(false)
    }
  })
})
