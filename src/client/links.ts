import type { TreeNode } from './types.js'

const ESQUEMA = /^[a-z][a-z0-9+.-]*:/i
const MARKDOWN = /\.(md|markdown)$/i

export interface EnlaceResuelto {
  path: string
  hash: string | null
}

function resolverRuta(currentPath: string, referencia: string): string | null {
  const base = currentPath.split('/')
  base.pop()

  for (const segmento of decodeURIComponent(referencia).split('/')) {
    if (segmento === '' || segmento === '.') continue
    if (segmento === '..') {
      if (base.length === 0) return null
      base.pop()
      continue
    }
    base.push(segmento)
  }

  return base.length === 0 ? null : base.join('/')
}

export function resolveDocLink(currentPath: string, href: string): EnlaceResuelto | null {
  if (href === '' || href.startsWith('#') || href.startsWith('/') || ESQUEMA.test(href)) return null

  const [referencia, ancla] = href.split('#')
  if (referencia === undefined || referencia === '' || !MARKDOWN.test(referencia)) return null

  const ruta = resolverRuta(currentPath, referencia)
  if (ruta === null) return null

  return { path: ruta, hash: ancla === undefined || ancla === '' ? null : ancla }
}

export function resolveAssetUrl(currentPath: string, src: string): string | null {
  if (src === '' || src.startsWith('/') || ESQUEMA.test(src)) return null

  const ruta = resolverRuta(currentPath, src)
  if (ruta === null) return null

  return `/assets/${ruta.split('/').map(encodeURIComponent).join('/')}`
}

export function collectPaths(nodes: TreeNode[], rootIndex: string | null): Set<string> {
  const rutas = new Set<string>()
  if (rootIndex !== null) rutas.add(rootIndex)

  const recorrer = (lista: TreeNode[]): void => {
    for (const node of lista) {
      if (node.type === 'document') {
        rutas.add(node.path)
        continue
      }
      if (node.indexPath !== null) rutas.add(node.indexPath)
      recorrer(node.children)
    }
  }

  recorrer(nodes)
  return rutas
}
