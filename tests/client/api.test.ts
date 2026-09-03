// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchDoc, fetchTree, searchDocs } from '../../src/client/api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function respuestaFalsa(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchTree', () => {
  it('pide el arbol y devuelve el cuerpo', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      respuestaFalsa({ root: '/docs', tree: [], rootIndex: null, rootTitle: null, defaultDoc: null }),
    )
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await fetchTree()

    expect(fetchFalso).toHaveBeenCalledWith('/api/tree')
    expect(resultado.tree).toEqual([])
  })
})

describe('fetchDoc', () => {
  it('codifica cada segmento de la ruta', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa({ path: 'guia/uso.md' }))
    vi.stubGlobal('fetch', fetchFalso)

    await fetchDoc('guia con espacio/uso.md')

    expect(fetchFalso).toHaveBeenCalledWith('/api/doc/guia%20con%20espacio/uso.md')
  })

  it('lanza ApiError con el codigo de estado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaFalsa({ error: 'not-found' }, 404)))

    await expect(fetchDoc('inexistente.md')).rejects.toMatchObject({ status: 404 })
    await expect(fetchDoc('inexistente.md')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('searchDocs', () => {
  it('codifica la consulta', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaFalsa({ status: 'ready', results: [] }))
    vi.stubGlobal('fetch', fetchFalso)

    await searchDocs('node 20')

    expect(fetchFalso).toHaveBeenCalledWith('/api/search?q=node%2020')
  })
})
