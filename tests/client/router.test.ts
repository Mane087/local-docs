// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { docUrl, routeFromLocation } from '../../src/client/router.js'

describe('routeFromLocation', () => {
  it('devuelve null cuando la ruta es la raiz', () => {
    expect(routeFromLocation({ pathname: '/', hash: '' })).toEqual({ docPath: null, hash: null })
  })

  it('extrae la ruta del documento', () => {
    expect(routeFromLocation({ pathname: '/guia/uso.md', hash: '' })).toEqual({
      docPath: 'guia/uso.md',
      hash: null,
    })
  })

  it('extrae el ancla', () => {
    expect(routeFromLocation({ pathname: '/guia/uso.md', hash: '#detalle' })).toEqual({
      docPath: 'guia/uso.md',
      hash: 'detalle',
    })
  })

  it('decodifica los caracteres escapados', () => {
    expect(routeFromLocation({ pathname: '/guia%20larga/uso.md', hash: '' })).toEqual({
      docPath: 'guia larga/uso.md',
      hash: null,
    })
  })
})

describe('docUrl', () => {
  it('construye la url del documento', () => {
    expect(docUrl('guia/uso.md')).toBe('/guia/uso.md')
  })

  it('codifica los segmentos y anade el ancla', () => {
    expect(docUrl('guia larga/uso.md', 'detalle')).toBe('/guia%20larga/uso.md#detalle')
  })
})
