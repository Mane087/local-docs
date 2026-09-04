import { describe, expect, it } from 'vitest'
import { collectPaths, resolveAssetUrl, resolveDocLink } from '../../src/client/links.js'
import type { TreeNode } from '../../src/client/types.js'

describe('resolveDocLink', () => {
  it('resuelve un enlace del mismo directorio', () => {
    expect(resolveDocLink('guia/uso.md', './otro.md')).toEqual({ path: 'guia/otro.md', hash: null })
  })

  it('resuelve un enlace sin prefijo', () => {
    expect(resolveDocLink('guia/uso.md', 'otro.md')).toEqual({ path: 'guia/otro.md', hash: null })
  })

  it('resuelve un enlace al directorio padre con ancla', () => {
    expect(resolveDocLink('guia/uso.md', '../intro.md#seccion')).toEqual({
      path: 'intro.md',
      hash: 'seccion',
    })
  })

  it('resuelve varios niveles hacia arriba', () => {
    expect(resolveDocLink('a/b/c.md', '../../x.md')).toEqual({ path: 'x.md', hash: null })
  })

  it('devuelve null cuando el enlace sale de la raiz', () => {
    expect(resolveDocLink('guia/uso.md', '../../fuera.md')).toBeNull()
  })

  it('devuelve null para enlaces externos', () => {
    expect(resolveDocLink('guia/uso.md', 'https://ejemplo.com')).toBeNull()
    expect(resolveDocLink('guia/uso.md', 'mailto:alguien@ejemplo.com')).toBeNull()
  })

  it('devuelve null para anclas del propio documento', () => {
    expect(resolveDocLink('guia/uso.md', '#seccion')).toBeNull()
  })

  it('devuelve null para enlaces que no apuntan a markdown', () => {
    expect(resolveDocLink('guia/uso.md', './diagrama.png')).toBeNull()
  })

  it('decodifica los caracteres escapados de la ruta', () => {
    expect(resolveDocLink('guia/uso.md', './otro%20documento.md')).toEqual({
      path: 'guia/otro documento.md',
      hash: null,
    })
  })
})

describe('resolveAssetUrl', () => {
  it('convierte una imagen relativa en una url de recurso', () => {
    expect(resolveAssetUrl('guia/uso.md', './imagenes/logo.png')).toBe('/assets/guia/imagenes/logo.png')
  })

  it('resuelve el directorio padre', () => {
    expect(resolveAssetUrl('guia/uso.md', '../logo.png')).toBe('/assets/logo.png')
  })

  it('deja intactas las urls absolutas', () => {
    expect(resolveAssetUrl('guia/uso.md', 'https://ejemplo.com/logo.png')).toBeNull()
    expect(resolveAssetUrl('guia/uso.md', 'data:image/png;base64,AAA')).toBeNull()
  })
})

describe('collectPaths', () => {
  it('reune todas las rutas de documento del arbol', () => {
    const nodes: TreeNode[] = [
      {
        type: 'directory',
        path: 'guia',
        title: 'Guia',
        hasIndex: true,
        indexPath: 'guia/index.md',
        children: [{ type: 'document', path: 'guia/uso.md', title: 'Uso', readable: true }],
      },
      { type: 'document', path: 'inicio.md', title: 'Inicio', readable: true },
    ]

    expect(collectPaths(nodes, 'README.md')).toEqual(
      new Set(['README.md', 'guia/index.md', 'guia/uso.md', 'inicio.md']),
    )
  })
})
