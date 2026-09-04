import { useEffect, useRef } from 'preact/hooks'
import { resolveAssetUrl, resolveDocLink } from '../links.js'
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

    for (const imagen of Array.from(nodo.querySelectorAll<HTMLImageElement>('img'))) {
      const origen = imagen.getAttribute('src') ?? ''
      const destino = resolveAssetUrl(doc.path, origen)
      if (destino !== null) imagen.setAttribute('src', destino)
    }

    for (const enlace of Array.from(nodo.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const destino = resolveDocLink(doc.path, enlace.getAttribute('href') ?? '')
      if (destino === null) continue
      if (!knownPaths.has(destino.path)) {
        enlace.setAttribute('data-roto', 'true')
        enlace.setAttribute('title', 'Este documento no existe')
      }
    }

    void renderMermaid(nodo, darkMode)
  }, [doc, knownPaths, darkMode])

  const alPulsar = (evento: MouseEvent): void => {
    const objetivo = (evento.target as HTMLElement).closest('a')
    if (objetivo === null) return

    const href = objetivo.getAttribute('href') ?? ''
    const destino = resolveDocLink(doc.path, href)
    if (destino === null) return

    evento.preventDefault()
    if (!knownPaths.has(destino.path)) return
    onNavigate(destino.path, destino.hash)
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
