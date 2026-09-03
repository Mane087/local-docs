import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DocumentCache, DocumentError } from '../../src/server/cache.js'
import { createRenderer, type Renderer } from '../../src/server/renderer.js'

let renderer: Renderer
const temporales: string[] = []

beforeAll(async () => {
  renderer = await createRenderer()
})

async function crearRaiz(): Promise<string> {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-cache-')))
  temporales.push(base)
  return base
}

afterEach(async () => {
  while (temporales.length > 0) {
    const dir = temporales.pop()
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('DocumentCache', () => {
  it('renderiza el documento en la primera peticion', async () => {
    const raiz = await crearRaiz()
    await fs.writeFile(path.join(raiz, 'doc.md'), '# Titulo')
    const cache = new DocumentCache(raiz, renderer)

    const documento = await cache.get('doc.md')

    expect(documento.html).toContain('<h1')
    expect(cache.has('doc.md')).toBe(true)
  })

  it('reutiliza el resultado mientras el archivo no cambia', async () => {
    const raiz = await crearRaiz()
    const archivo = path.join(raiz, 'doc.md')
    await fs.writeFile(archivo, '# Original')
    const cache = new DocumentCache(raiz, renderer)

    const primero = await cache.get('doc.md')
    const segundo = await cache.get('doc.md')

    expect(segundo).toBe(primero)
  })

  it('vuelve a renderizar despues de invalidar', async () => {
    const raiz = await crearRaiz()
    const archivo = path.join(raiz, 'doc.md')
    await fs.writeFile(archivo, '# Original')
    const cache = new DocumentCache(raiz, renderer)
    await cache.get('doc.md')

    await fs.writeFile(archivo, '# Modificado')
    cache.invalidate('doc.md')
    const actualizado = await cache.get('doc.md')

    expect(actualizado.html).toContain('Modificado')
  })

  it('detecta un cambio de fecha de modificacion aunque no se invalide', async () => {
    const raiz = await crearRaiz()
    const archivo = path.join(raiz, 'doc.md')
    await fs.writeFile(archivo, '# Original')
    const cache = new DocumentCache(raiz, renderer)
    await cache.get('doc.md')

    await fs.writeFile(archivo, '# Modificado')
    const futuro = new Date(Date.now() + 2000)
    await fs.utimes(archivo, futuro, futuro)

    const actualizado = await cache.get('doc.md')
    expect(actualizado.html).toContain('Modificado')
  })

  it('lanza not-found cuando el documento no existe', async () => {
    const raiz = await crearRaiz()
    const cache = new DocumentCache(raiz, renderer)

    await expect(cache.get('inexistente.md')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('lanza forbidden cuando la ruta sale de la raiz', async () => {
    const raiz = await crearRaiz()
    const cache = new DocumentCache(raiz, renderer)

    await expect(cache.get('../fuera.md')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lanza not-found cuando la ruta no es un documento markdown', async () => {
    const raiz = await crearRaiz()
    await fs.writeFile(path.join(raiz, 'imagen.png'), 'x')
    const cache = new DocumentCache(raiz, renderer)

    await expect(cache.get('imagen.png')).rejects.toBeInstanceOf(DocumentError)
  })
})
