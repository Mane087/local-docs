import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { DocumentCache } from '../../src/server/cache.js'
import { createRenderer, type Renderer } from '../../src/server/renderer.js'
import { SearchIndex, collectDocuments } from '../../src/server/search-index.js'
import { createServer, hostPermitido } from '../../src/server/server.js'
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

async function levantar(
  archivos: Record<string, string>,
  preparar?: (raiz: string) => Promise<void>,
): Promise<{ base: string; raiz: string }> {
  const raiz = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-server-')))
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(raiz, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }
  if (preparar) await preparar(raiz)

  const clientDir = path.join(raiz, '..', path.basename(raiz) + '-client')
  await fs.mkdir(clientDir, { recursive: true })
  await fs.writeFile(path.join(clientDir, 'index.html'), '<div id="app"></div>')

  const cache = new DocumentCache(raiz, renderer)
  const tree = createTreeProvider(raiz)
  const index = new SearchIndex(cache)
  const resultado = await tree.get()
  await index.build(collectDocuments(resultado.nodes, resultado.rootIndex, resultado.rootTitle))

  const eventos = { addClient: () => {}, emit: () => {}, closeAll: () => {} }
  const servidor = createServer({ root: raiz, cache, index, tree, events: eventos, clientDir, host: '127.0.0.1' })

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

  it('devuelve el titulo del indice de la raiz y no el nombre del archivo', async () => {
    const { base } = await levantar({ 'index.md': '# Guia del proyecto', 'guia/uso.md': '# Uso' })

    const documento = await (await fetch(`${base}/api/doc/index.md`)).json()
    const busqueda = await (await fetch(`${base}/api/search?q=proyecto`)).json()

    expect(documento.title).toBe('Guia del proyecto')
    // Las dos vistas del mismo hecho tienen que coincidir.
    expect(busqueda.results[0].title).toBe(documento.title)
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

describe('contencion de la raiz con enlaces simbolicos', () => {
  async function crearExterior(archivos: Record<string, string>): Promise<string> {
    const fuera = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-fuera-')))
    for (const [relativo, contenido] of Object.entries(archivos)) {
      await fs.writeFile(path.join(fuera, relativo), contenido)
    }
    limpiezas.push(async () => {
      await fs.rm(fuera, { recursive: true, force: true })
    })
    return fuera
  }

  it('devuelve 403 en /assets/ para un enlace que apunta fuera de la raiz', async () => {
    const fuera = await crearExterior({ 'secreto.txt': 'contenido privado' })
    const { base } = await levantar({ 'doc.md': '# Doc' }, async (raiz) => {
      await fs.symlink(path.join(fuera, 'secreto.txt'), path.join(raiz, 'escape.txt'))
    })

    const respuesta = await fetch(`${base}/assets/escape.txt`)

    expect(respuesta.status).toBe(403)
    expect(await respuesta.text()).not.toContain('contenido privado')
  })

  it('devuelve 403 en /api/doc/ para un enlace que apunta fuera de la raiz', async () => {
    const fuera = await crearExterior({ 'secreto.md': '# Privado' })
    const { base } = await levantar({ 'doc.md': '# Doc' }, async (raiz) => {
      await fs.symlink(path.join(fuera, 'secreto.md'), path.join(raiz, 'escape.md'))
    })

    const respuesta = await fetch(`${base}/api/doc/escape.md`)

    expect(respuesta.status).toBe(403)
    expect(await respuesta.text()).not.toContain('Privado')
  })

  it('devuelve 403 cuando el enlace fuera de la raiz esta en un directorio anidado', async () => {
    const fuera = await crearExterior({ 'secreto.md': '# Privado' })
    const { base } = await levantar({ 'guia/uso.md': '# Uso' }, async (raiz) => {
      await fs.symlink(path.join(fuera, 'secreto.md'), path.join(raiz, 'guia', 'escape.md'))
    })

    expect((await fetch(`${base}/api/doc/guia/escape.md`)).status).toBe(403)
  })

  it('sigue sirviendo un enlace cuyo destino esta dentro de la raiz', async () => {
    const { base } = await levantar(
      { 'real/doc.md': '# Real', 'real/imagen.svg': '<svg></svg>' },
      async (raiz) => {
        await fs.symlink(path.join(raiz, 'real', 'doc.md'), path.join(raiz, 'alias.md'))
        await fs.symlink(path.join(raiz, 'real', 'imagen.svg'), path.join(raiz, 'alias.svg'))
      },
    )

    const documento = await fetch(`${base}/api/doc/alias.md`)
    expect(documento.status).toBe(200)
    expect((await documento.json()).html).toContain('Real')

    const recurso = await fetch(`${base}/assets/alias.svg`)
    expect(recurso.status).toBe(200)
    expect(recurso.headers.get('content-type')).toContain('image/svg+xml')
    expect(await recurso.text()).toBe('<svg></svg>')
  })

  it('devuelve 404 en /assets/ para un enlace roto dentro de la raiz', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' }, async (raiz) => {
      await fs.symlink(path.join(raiz, 'no-existe.txt'), path.join(raiz, 'roto.txt'))
    })

    expect((await fetch(`${base}/assets/roto.txt`)).status).toBe(404)
  })
})

describe('validacion de la cabecera Host', () => {
  function pedirConHost(base: string, ruta: string, host: string): Promise<{ status: number }> {
    const url = new URL(base)
    return new Promise((resolver, rechazar) => {
      const peticion = http.request(
        { host: url.hostname, port: url.port, path: ruta, method: 'GET', headers: { Host: host } },
        (respuesta) => {
          respuesta.resume()
          respuesta.on('end', () => resolver({ status: respuesta.statusCode ?? 0 }))
        },
      )
      peticion.on('error', rechazar)
      peticion.end()
    })
  }

  it('rechaza una peticion cuyo Host no corresponde a la interfaz de escucha', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })

    // Reenlace de DNS: un dominio del atacante que resuelva a 127.0.0.1 es
    // del mismo origen para el navegador y podria leer la API.
    expect((await pedirConHost(base, '/api/tree', 'atacante.example')).status).toBe(403)
    expect((await pedirConHost(base, '/api/doc/doc.md', 'atacante.example')).status).toBe(403)
  })

  it('acepta la direccion numerica y localhost cuando se escucha en la interfaz local', async () => {
    const { base } = await levantar({ 'doc.md': '# Doc' })
    const puerto = new URL(base).port

    expect((await pedirConHost(base, '/api/tree', `127.0.0.1:${puerto}`)).status).toBe(200)
    expect((await pedirConHost(base, '/api/tree', `localhost:${puerto}`)).status).toBe(200)
    expect((await pedirConHost(base, '/api/tree', `[::1]:${puerto}`)).status).toBe(200)
  })
})

describe('hostPermitido', () => {
  it('acepta el nombre exacto de la interfaz de escucha, con y sin puerto', () => {
    expect(hostPermitido('192.168.1.5:4180', '192.168.1.5')).toBe(true)
    expect(hostPermitido('192.168.1.5', '192.168.1.5')).toBe(true)
    expect(hostPermitido('mi-equipo:4180', 'mi-equipo')).toBe(true)
  })

  it('trata como equivalentes los nombres de la maquina local', () => {
    expect(hostPermitido('localhost:4180', '127.0.0.1')).toBe(true)
    expect(hostPermitido('127.0.0.1:4180', 'localhost')).toBe(true)
    expect(hostPermitido('[::1]:4180', '127.0.0.1')).toBe(true)
  })

  it('rechaza cualquier otro nombre y la cabecera ausente o malformada', () => {
    expect(hostPermitido('atacante.example:4180', '127.0.0.1')).toBe(false)
    expect(hostPermitido('127.0.0.1@atacante.example', '127.0.0.1')).toBe(false)
    expect(hostPermitido(undefined, '127.0.0.1')).toBe(false)
    expect(hostPermitido('', '127.0.0.1')).toBe(false)
    expect(hostPermitido('no es un host', '127.0.0.1')).toBe(false)
  })

  it('no valida nada cuando se escucha en todas las interfaces, que es una exposicion pedida a proposito', () => {
    expect(hostPermitido('lo-que-sea.example', '0.0.0.0')).toBe(true)
    expect(hostPermitido('lo-que-sea.example', '::')).toBe(true)
  })
})
