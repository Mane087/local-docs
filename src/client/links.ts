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

// Un href que no es externo, no es una ancla propia y no es una ruta absoluta,
// pero cuya parte anterior al '#' tiene extension markdown. Se separa de
// resolveDocLink para poder distinguir, en el visor, entre "esto no es un
// enlace de documento" (externo, ancla propia, imagen) y "esto es un enlace
// de documento que no se pudo resolver dentro de la raiz" -vease
// esEnlaceDocumentoFueraDeRaiz.
function referenciaMarkdown(href: string): string | null {
  if (href === '' || href.startsWith('#') || href.startsWith('/') || ESQUEMA.test(href)) return null

  const [referencia] = href.split('#')
  if (referencia === undefined || referencia === '' || !MARKDOWN.test(referencia)) return null

  return referencia
}

export function resolveDocLink(currentPath: string, href: string): EnlaceResuelto | null {
  const referencia = referenciaMarkdown(href)
  if (referencia === null) return null

  const ancla = href.split('#')[1]
  const ruta = resolverRuta(currentPath, referencia)
  if (ruta === null) return null

  return { path: ruta, hash: ancla === undefined || ancla === '' ? null : ancla }
}

// true cuando el href apunta claramente a un documento markdown relativo
// (por su forma y extension) pero la ruta resultante escapa de la raiz de
// documentacion. Un enlace externo, una ancla propia o un recurso que no es
// markdown no es "invalido": simplemente no es un enlace de documento, y
// devuelve false igual que un enlace que si se resuelve.
export function esEnlaceDocumentoFueraDeRaiz(currentPath: string, href: string): boolean {
  const referencia = referenciaMarkdown(href)
  if (referencia === null) return false

  return resolverRuta(currentPath, referencia) === null
}

export function resolveAssetUrl(currentPath: string, src: string): string | null {
  if (src === '' || src.startsWith('/') || ESQUEMA.test(src)) return null

  const ruta = resolverRuta(currentPath, src)
  if (ruta === null) return null

  return `/assets/${ruta.split('/').map(encodeURIComponent).join('/')}`
}

// Un href relativo que no apunta a un documento markdown -una imagen, un PDF,
// un fichero descargable- se reescribe hacia la ruta de recursos del servidor,
// igual que las imagenes. Devuelve null para enlaces externos, anclas propias,
// rutas absolutas y referencias markdown, que conservan su tratamiento propio.
export function resolveRelativeAssetLink(currentPath: string, href: string): string | null {
  if (href === '' || href.startsWith('#') || href.startsWith('/') || ESQUEMA.test(href)) return null

  const partes = href.split('#')
  const referencia = partes[0] ?? ''
  if (referencia === '' || MARKDOWN.test(referencia)) return null

  const url = resolveAssetUrl(currentPath, referencia)
  if (url === null) return null

  const ancla = partes.slice(1).join('#')
  return ancla === '' ? url : `${url}#${ancla}`
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
