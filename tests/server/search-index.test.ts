import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DocumentCache } from '../../src/server/cache.js'
import { createRenderer, type Renderer } from '../../src/server/renderer.js'
import { SearchIndex } from '../../src/server/search-index.js'

let renderer: Renderer
const temporales: string[] = []

beforeAll(async () => {
  renderer = await createRenderer()
})

async function crearRaiz(archivos: Record<string, string>): Promise<string> {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-index-')))
  temporales.push(base)
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(base, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }
  return base
}

afterEach(async () => {
  while (temporales.length > 0) {
    const dir = temporales.pop()
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('SearchIndex', () => {
  it('nace en estado indexing y pasa a ready tras construirse', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nContenido.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))

    // La seccion 6.3 del spec solo contempla 'indexing' y 'ready': un indice
    // recien creado, sobre el que ya se pueden hacer peticiones, esta en
    // construccion, no en un tercer estado sin definir.
    expect(index.status).toBe('indexing')
    await index.build([{ path: 'doc.md', title: 'Doc' }])
    expect(index.status).toBe('ready')
  })

  it('encuentra un termino presente solo en el cuerpo del documento', async () => {
    const raiz = await crearRaiz({
      'instalacion.md': '# Instalacion\n\nRequiere Node 20 o superior.',
      'otro.md': '# Otro\n\nTexto sin relacion.',
    })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([
      { path: 'instalacion.md', title: 'Instalacion' },
      { path: 'otro.md', title: 'Otro' },
    ])

    const resultados = index.search('node')

    expect(resultados).toHaveLength(1)
    expect(resultados[0]?.path).toBe('instalacion.md')
  })

  it('devuelve fragmentos con el termino marcado y el contexto alrededor', async () => {
    const raiz = await crearRaiz({
      'doc.md': '# Doc\n\n' + 'relleno '.repeat(20) + 'la palabra buscada aparece aqui ' + 'relleno '.repeat(20),
    })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    const resultados = index.search('buscada')

    expect(resultados[0]?.fragments[0]).toContain('<mark>buscada</mark>')
    expect(resultados[0]?.fragments[0]?.length).toBeLessThan(300)
  })

  it('no corta un emoji al construir el fragmento cuando el limite de contexto cae en medio del par subrogado', async () => {
    const emojiInicial = '😀'
    const emojiFinal = '🎉'
    const contenido = emojiInicial + 'x'.repeat(79) + 'buscada' + 'x'.repeat(79) + emojiFinal
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\n' + contenido })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    const resultados = index.search('buscada')
    const fragmento = resultados[0]?.fragments[0] ?? ''

    for (const caracter of fragmento) {
      const codigo = caracter.codePointAt(0) ?? 0
      expect(codigo < 0xd800 || codigo > 0xdfff).toBe(true)
    }
  })

  it('escapa el html del contenido en los fragmentos', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nUsa `<script>alerta</script>` peligroso.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    const resultados = index.search('peligroso')

    expect(resultados[0]?.fragments[0]).not.toContain('<script>')
  })

  it('encuentra por prefijo', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nConfiguracion avanzada.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    expect(index.search('config')).toHaveLength(1)
  })

  it('devuelve una lista vacia con una consulta vacia', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nTexto.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    expect(index.search('   ')).toEqual([])
  })

  it('actualiza un documento modificado', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nPrimera version.' })
    const cache = new DocumentCache(raiz, renderer)
    const index = new SearchIndex(cache)
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    await fs.writeFile(path.join(raiz, 'doc.md'), '# Doc\n\nSegunda redaccion.')
    cache.invalidate('doc.md')
    await index.update('doc.md', 'Doc')

    expect(index.search('primera')).toEqual([])
    expect(index.search('redaccion')).toHaveLength(1)
  })

  it('elimina un documento borrado', async () => {
    const raiz = await crearRaiz({ 'doc.md': '# Doc\n\nContenido unico.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))
    await index.build([{ path: 'doc.md', title: 'Doc' }])

    index.remove('doc.md')

    expect(index.search('unico')).toEqual([])
  })

  it('ignora los documentos ilegibles sin interrumpir la construccion', async () => {
    const raiz = await crearRaiz({ 'bueno.md': '# Bueno\n\nTexto valido.' })
    const index = new SearchIndex(new DocumentCache(raiz, renderer))

    await index.build([
      { path: 'inexistente.md', title: 'Inexistente' },
      { path: 'bueno.md', title: 'Bueno' },
    ])

    expect(index.status).toBe('ready')
    expect(index.search('valido')).toHaveLength(1)
  })
})
