import { describe, expect, it } from 'vitest'
import {
  collectPaths,
  esEnlaceDocumentoFueraDeRaiz,
  resolveAssetUrl,
  resolveDocLink,
  resolveRelativeAssetLink,
} from '../../src/client/links.js'
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

describe('esEnlaceDocumentoFueraDeRaiz', () => {
  it('detecta un enlace markdown relativo que escapa de la raiz', () => {
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', '../../fuera.md')).toBe(true)
  })

  it('no marca como fuera de raiz un enlace markdown que si se resuelve', () => {
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', './otro.md')).toBe(false)
  })

  it('no marca como fuera de raiz los enlaces que no son de documento', () => {
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', 'https://ejemplo.com')).toBe(false)
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', '#seccion')).toBe(false)
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', './diagrama.png')).toBe(false)
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

describe('codificacion invalida en la referencia', () => {
  // El visor recorre los enlaces dentro de un efecto: si la decodificacion
  // lanza, la excepcion deja la aplicacion en blanco. Las tres funciones que
  // dependen de resolverRuta tratan la referencia como no resoluble.
  it('resolveDocLink devuelve null en vez de lanzar', () => {
    expect(() => resolveDocLink('guia/uso.md', './a%zz.md')).not.toThrow()
    expect(resolveDocLink('guia/uso.md', './a%zz.md')).toBeNull()
  })

  it('resolveAssetUrl y resolveRelativeAssetLink devuelven null en vez de lanzar', () => {
    expect(resolveAssetUrl('guia/uso.md', './a%zz.png')).toBeNull()
    expect(resolveRelativeAssetLink('guia/uso.md', './a%zz.pdf')).toBeNull()
  })

  it('esEnlaceDocumentoFueraDeRaiz trata el enlace markdown como no resoluble', () => {
    expect(esEnlaceDocumentoFueraDeRaiz('guia/uso.md', './a%zz.md')).toBe(true)
  })
})

describe('resolveRelativeAssetLink', () => {
  it('reescribe un enlace relativo a un fichero que no es markdown', () => {
    expect(resolveRelativeAssetLink('guia/uso.md', './tabla.pdf')).toBe('/assets/guia/tabla.pdf')
  })

  it('resuelve el directorio padre y conserva el ancla', () => {
    expect(resolveRelativeAssetLink('guia/uso.md', '../anexos/plan.pdf#pagina=2')).toBe(
      '/assets/anexos/plan.pdf#pagina=2',
    )
  })

  it('no toca enlaces externos, anclas propias, rutas absolutas ni documentos markdown', () => {
    expect(resolveRelativeAssetLink('guia/uso.md', 'https://ejemplo.com/a.pdf')).toBeNull()
    expect(resolveRelativeAssetLink('guia/uso.md', '#seccion')).toBeNull()
    expect(resolveRelativeAssetLink('guia/uso.md', '/assets/guia/tabla.pdf')).toBeNull()
    expect(resolveRelativeAssetLink('guia/uso.md', './otro.md')).toBeNull()
    expect(resolveRelativeAssetLink('guia/uso.md', '')).toBeNull()
  })

  it('devuelve null cuando la ruta escapa de la raiz', () => {
    expect(resolveRelativeAssetLink('guia/uso.md', '../../fuera.pdf')).toBeNull()
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

  it('deja fuera los documentos ilegibles, que el sidebar tampoco enlaza', () => {
    const nodes: TreeNode[] = [
      { type: 'document', path: 'inicio.md', title: 'Inicio', readable: true },
      { type: 'document', path: 'privado.md', title: 'Privado', readable: false },
    ]

    expect(collectPaths(nodes, null)).toEqual(new Set(['inicio.md']))
  })
})
