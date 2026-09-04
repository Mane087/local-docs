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

  it('no lanza ante un porcentaje de codificacion invalido', () => {
    // Sin proteccion, decodeURIComponent lanza desde el render inicial y la
    // aplicacion se queda en blanco. El servidor ya devuelve 400 para esta
    // ruta, asi que basta con conservar el texto tal cual y dejar que la
    // peticion falle de forma controlada.
    expect(routeFromLocation({ pathname: '/%E0%A4%A', hash: '' })).toEqual({
      docPath: '%E0%A4%A',
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
