import { describe, expect, it } from 'vitest'
import { compareEntries, humanizeName, stripOrderPrefix, type SortableEntry } from '../../src/server/titles.js'

describe('stripOrderPrefix', () => {
  it('extrae el prefijo numerico', () => {
    expect(stripOrderPrefix('01-guia-de-inicio.md')).toEqual({ prefixOrder: 1, rest: 'guia-de-inicio.md' })
  })

  it('acepta guion bajo y punto como separador', () => {
    expect(stripOrderPrefix('02_avanzado')).toEqual({ prefixOrder: 2, rest: 'avanzado' })
    expect(stripOrderPrefix('3.notas.md')).toEqual({ prefixOrder: 3, rest: 'notas.md' })
  })

  it('devuelve el nombre intacto cuando no hay prefijo', () => {
    expect(stripOrderPrefix('inicio.md')).toEqual({ prefixOrder: null, rest: 'inicio.md' })
  })

  it('no confunde un nombre que empieza por numero sin separador', () => {
    expect(stripOrderPrefix('2024informe.md')).toEqual({ prefixOrder: null, rest: '2024informe.md' })
  })
})

describe('humanizeName', () => {
  it('quita extension, prefijo y separadores', () => {
    expect(humanizeName('01-guia-de-inicio.md')).toBe('Guia de inicio')
  })

  it('acepta guiones bajos', () => {
    expect(humanizeName('mi_documento.markdown')).toBe('Mi documento')
  })

  it('acepta nombres de directorio', () => {
    expect(humanizeName('referencia-api')).toBe('Referencia api')
  })
})

describe('compareEntries', () => {
  const entrada = (parcial: Partial<SortableEntry>): SortableEntry => ({
    type: 'document',
    order: null,
    prefixOrder: null,
    name: 'x',
    ...parcial,
  })

  it('coloca los directorios antes que los documentos', () => {
    expect(compareEntries(entrada({ type: 'directory', name: 'z' }), entrada({ name: 'a' }))).toBeLessThan(0)
  })

  it('ordena por el campo order del frontmatter', () => {
    expect(compareEntries(entrada({ order: 1 }), entrada({ order: 2 }))).toBeLessThan(0)
  })

  it('coloca los elementos con order antes que los que no lo tienen', () => {
    expect(compareEntries(entrada({ order: 5 }), entrada({ order: null }))).toBeLessThan(0)
  })

  it('usa el prefijo numerico cuando no hay order', () => {
    expect(compareEntries(entrada({ prefixOrder: 1 }), entrada({ prefixOrder: 10 }))).toBeLessThan(0)
  })

  it('ordena alfabeticamente de forma natural e insensible a mayusculas', () => {
    expect(compareEntries(entrada({ name: 'archivo2' }), entrada({ name: 'archivo10' }))).toBeLessThan(0)
    expect(compareEntries(entrada({ name: 'Beta' }), entrada({ name: 'alfa' }))).toBeGreaterThan(0)
  })

  it('compara order y prefixOrder en la misma escala entre elementos distintos', () => {
    expect(compareEntries(entrada({ order: 3 }), entrada({ prefixOrder: 1 }))).toBeGreaterThan(0)
    expect(compareEntries(entrada({ order: 3 }), entrada({ prefixOrder: 10 }))).toBeLessThan(0)
  })

  it('da prioridad a order sobre prefixOrder en un mismo elemento', () => {
    expect(compareEntries(entrada({ order: 1, prefixOrder: 99 }), entrada({ order: 2, prefixOrder: 1 }))).toBeLessThan(0)
  })
})
