import { useEffect, useRef } from 'preact/hooks'
import { esClicPrimario } from '../dom.js'
import {
  esEnlaceDocumentoFueraDeRaiz,
  resolveAssetUrl,
  resolveDocLink,
  resolveRelativeAssetLink,
} from '../links.js'
import { renderMermaid } from '../mermaid.js'
import type { DocResponse } from '../types.js'

const AVISOS: Record<string, string> = {
  'frontmatter-invalido': 'El frontmatter de este documento no es valido y se ha ignorado.',
}

interface Props {
  doc: DocResponse
  knownPaths: Set<string>
  darkMode: boolean
  onNavigate(path: string, hash: string | null): void
}

export function Viewer({ doc, knownPaths, darkMode, onNavigate }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const nodo = contenedor.current
    if (nodo === null) return

    // Los encabezados reciben foco programatico al elegirlos en la tabla de
    // contenidos; sin este atributo el navegador los ignora por no ser
    // elementos interactivos y el foco se queda donde estaba.
    for (const encabezado of Array.from(nodo.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'))) {
      encabezado.tabIndex = -1
    }

    for (const imagen of Array.from(nodo.querySelectorAll<HTMLImageElement>('img'))) {
      const origen = imagen.getAttribute('src') ?? ''
      const destino = resolveAssetUrl(doc.path, origen)
      if (destino !== null) imagen.setAttribute('src', destino)
    }

    for (const enlace of Array.from(nodo.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = enlace.getAttribute('href') ?? ''
      const destino = resolveDocLink(doc.path, href)

      // Un enlace de documento roto tiene dos motivos posibles: apunta a una
      // ruta bien resuelta que no existe en el arbol, o su ruta relativa
      // escapa de la raiz y no se pudo resolver en absoluto. Ambos se marcan
      // igual porque para quien lee el documento son el mismo problema.
      const roto = destino !== null ? !knownPaths.has(destino.path) : esEnlaceDocumentoFueraDeRaiz(doc.path, href)
      if (roto) {
        enlace.setAttribute('data-roto', 'true')
        enlace.setAttribute('title', 'Este documento no existe')
        continue
      }
      if (destino !== null) continue

      // No es un enlace de documento: si es una referencia relativa a otro
      // fichero de la raiz (un PDF, un descargable) se reescribe hacia la
      // ruta de recursos, igual que las imagenes. Los enlaces externos, las
      // anclas propias y las rutas absolutas devuelven null y no se tocan.
      // La reescritura es idempotente: el href resultante ya es absoluto.
      const recurso = resolveRelativeAssetLink(doc.path, href)
      if (recurso !== null) enlace.setAttribute('href', recurso)
    }

    void renderMermaid(nodo, darkMode)
  }, [doc, knownPaths, darkMode])

  const alPulsar = (evento: MouseEvent): void => {
    const objetivo = (evento.target as HTMLElement).closest('a')
    if (objetivo === null || !esClicPrimario(evento)) return

    const href = objetivo.getAttribute('href') ?? ''
    const destino = resolveDocLink(doc.path, href)
    if (destino !== null) {
      evento.preventDefault()
      if (knownPaths.has(destino.path)) onNavigate(destino.path, destino.hash)
      return
    }

    // No es un enlace de documento resoluble, pero si parecia serlo (extension
    // markdown) y su ruta escapa de la raiz: se bloquea la recarga de pagina
    // sin navegar dentro de la aplicacion, igual que con un documento
    // inexistente. Un enlace externo, una ancla propia o un recurso no
    // markdown no entra aqui y conserva su comportamiento nativo.
    if (esEnlaceDocumentoFueraDeRaiz(doc.path, href)) evento.preventDefault()
  }

  return (
    <article>
      {doc.breadcrumb.length > 0 ? (
        <nav class="migas" aria-label="Ubicacion">
          {doc.breadcrumb.map((paso) => paso.title).join(' / ')}
        </nav>
      ) : null}
      {doc.warnings.map((aviso) => (
        <p class="aviso" key={aviso}>
          {AVISOS[aviso] ?? aviso}
        </p>
      ))}
      <div ref={contenedor} onClick={alPulsar} dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  )
}
