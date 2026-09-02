import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { safeJoin, toRelative } from '../../src/server/paths.js'

const root = path.resolve('/proyecto/docs')

describe('safeJoin', () => {
  it('resuelve una ruta relativa dentro de la raiz', () => {
    expect(safeJoin(root, 'guia/inicio.md')).toBe(path.join(root, 'guia', 'inicio.md'))
  })

  it('acepta la raiz misma con cadena vacia', () => {
    expect(safeJoin(root, '')).toBe(root)
  })

  it('rechaza rutas que salen de la raiz', () => {
    expect(safeJoin(root, '../secreto.md')).toBeNull()
    expect(safeJoin(root, 'guia/../../secreto.md')).toBeNull()
  })

  it('rechaza rutas absolutas', () => {
    expect(safeJoin(root, '/etc/passwd')).toBeNull()
  })

  it('rechaza rutas con bytes nulos', () => {
    expect(safeJoin(root, 'guia\0.md')).toBeNull()
  })
})

describe('toRelative', () => {
  it('devuelve una ruta relativa con separador posix', () => {
    const absolute = path.join(root, 'guia', 'inicio.md')
    expect(toRelative(root, absolute)).toBe('guia/inicio.md')
  })
})
