import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { DocumentCache } from '../../src/server/cache.js'
import { createRenderer, type Renderer } from '../../src/server/renderer.js'
import { SearchIndex, collectDocuments } from '../../src/server/search-index.js'
import { createServer } from '../../src/server/server.js'
import { createTreeProvider } from '../../src/server/tree-provider.js'

let renderer: Renderer
const limpiezas: Array<() => Promise<void>> = []

beforeAll(async () => {
  renderer = await createRenderer()
})

afterEach(async () => {
  while (limpiezas.length > 0) {
    const limpiar = limpiezas.pop()
    if (limpiar) await limpiar()
  }
})

async function levantar(archivos: Record<string, string>): Promise<{ base: string; raiz: string }> {
  const raiz = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-server-')))
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(raiz, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }

  const clientDir = path.join(raiz, '..', path.basename(raiz) + '-client')
  await fs.mkdir(clientDir, { recursive: true })
  await fs.writeFile(path.join(clientDir, 'index.html'), '<div id="app"></div>')

  const cache = new DocumentCache(raiz, renderer)
  const tree = createTreeProvider(raiz)
  const index = new SearchIndex(cache)
  const resultado = await tree.get()
  await index.build(collectDocuments(resultado.nodes, resultado.rootIndex, resultado.rootTitle))

  const eventos = { addClient: () => {}, emit: () => {}, closeAll: () => {} }
  const servidor = createServer({ root: raiz, cache, index, tree, events: eventos, clientDir })

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const puerto = (servidor.address() as AddressInfo).port

  limpiezas.push(async () => {
    await new Promise<void>((resolver) => servidor.close(() => resolver()))
    await fs.rm(raiz, { recursive: true, force: true })
    await fs.rm(clientDir, { recursive: true, force: true })
  })

  return { base: `http://127.0.0.1:${puerto}`, raiz }
}

describe('GET /api/tree', () => {
  it('devuelve el arbol y el indice de la raiz', async () => {
    const { base } = await levantar({ 'README.md': '# Portada', 'guia/uso.md': '# Uso' })

    const respuesta = await fetch(`${base}/api/tree`)
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(200)
    expect(cuerpo.rootIndex).toBe('README.md')
    expect(cuerpo.defaultDoc).toBe('README.md')
    expect(cuerpo.tree[0].path).toBe('guia')
  })
})

describe('GET /api/doc', () => {
  it('devuelve el documento renderizado con su ruta de navegacion', async () => {
    const { base } = await levantar({ 'guia/uso.md': '# Uso\n\n## Detalle' })

    const respuesta = await fetch(`${base}/api/doc/guia/uso.md`)
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(200)
    expect(cuerpo.path).toBe('guia/uso.md')
    expect(cuerpo.title).toBe('Uso')
    expect(cuerpo.html).toContain('<h1')
    expect(cuerpo.headings).toContainEqual({ level: 2, id: 'detalle', text: 'Detalle' })
    expect(cuerpo.breadcrumb).toEqual([{ path: 'guia', title: 'Guia' }])
  })

  it('devuelve 404 cuando el documento no existe', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    const respuesta = await fetch(`${base}/api/doc/inexistente.md`)

    expect(respuesta.status).toBe(404)
  })

  it('devuelve 403 cuando la ruta sale de la raiz', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    const respuesta = await fetch(`${base}/api/doc/${encodeURIComponent('../fuera.md')}`)

    expect(respuesta.status).toBe(403)
  })

  it('incluye el aviso de frontmatter invalido', async () => {
    const { base } = await levantar({ 'doc.md': '---\ntitle: [sin cerrar\n---\n\n# Contenido' })

    const cuerpo = await (await fetch(`${base}/api/doc/doc.md`)).json()

    expect(cuerpo.warnings).toContain('frontmatter-invalido')
  })
})

describe('rutas malformadas', () => {
  it('devuelve 400 ante un porcentaje de codificacion invalido y el servidor sigue respondiendo', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    const respuestaMalformada = await fetch(`${base}/api/doc/%E0%A4%A`)

    expect(respuestaMalformada.status).toBe(400)
    expect(await respuestaMalformada.json()).toEqual({ error: 'bad-request' })

    const respuestaValida = await fetch(`${base}/api/doc/doc.md`)

    expect(respuestaValida.status).toBe(200)
  })
})

describe('GET /api/search', () => {
  it('devuelve resultados con fragmentos', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc\n\nRequiere Node 20 o superior.' })

    const cuerpo = await (await fetch(`${base}/api/search?q=node`)).json()

    expect(cuerpo.status).toBe('ready')
    expect(cuerpo.results[0].path).toBe('doc.md')
    expect(cuerpo.results[0].fragments[0]).toContain('<mark>')
  })

  it('devuelve una lista vacia sin parametro de consulta', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    const cuerpo = await (await fetch(`${base}/api/search`)).json()

    expect(cuerpo.results).toEqual([])
  })
})

describe('GET /assets', () => {
  it('sirve un recurso no markdown con su tipo mime', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc', 'imagenes/logo.svg': '<svg></svg>' })

    const respuesta = await fetch(`${base}/assets/imagenes/logo.svg`)

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-type')).toContain('image/svg+xml')
    expect(await respuesta.text()).toBe('<svg></svg>')
  })

  it('devuelve 403 cuando el recurso sale de la raiz', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    const respuesta = await fetch(`${base}/assets/${encodeURIComponent('../fuera.png')}`)

    expect(respuesta.status).toBe(403)
  })
})

describe('rutas del cliente', () => {
  it('devuelve index.html para una ruta de navegacion', async () => {
    const { base } = await levantar({ 'guia/uso.md': '# Uso' })

    const respuesta = await fetch(`${base}/guia/uso.md`)

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-type')).toContain('text/html')
    expect(await respuesta.text()).toContain('id="app"')
  })
})
