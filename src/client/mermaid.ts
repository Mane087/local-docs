let cargado: Promise<typeof import('mermaid')> | null = null

export async function renderMermaid(container: HTMLElement, oscuro: boolean): Promise<void> {
  const bloques = Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (bloques.length === 0) return

  if (cargado === null) cargado = import('mermaid')
  const modulo = await cargado
  const mermaid = modulo.default

  mermaid.initialize({ startOnLoad: false, theme: oscuro ? 'dark' : 'default' })

  for (const [indice, bloque] of bloques.entries()) {
    // El primer renderizado sustituye el contenido del bloque (por el SVG o por
    // el mensaje de error), asi que la fuente original se guarda una sola vez
    // en un atributo de datos. Los renderizados posteriores -por ejemplo al
    // cambiar de tema- siempre parten de esa fuente guardada y no del
    // contenido actual del bloque.
    if (bloque.dataset.mermaidFuente === undefined) {
      bloque.dataset.mermaidFuente = bloque.textContent ?? ''
    }
    const fuente = bloque.dataset.mermaidFuente

    try {
      const { svg } = await mermaid.render(`mermaid-${Date.now()}-${indice}`, fuente)
      bloque.innerHTML = svg
      bloque.setAttribute('data-renderizado', 'true')
      bloque.removeAttribute('data-error')
    } catch (error) {
      bloque.removeAttribute('data-renderizado')
      bloque.setAttribute('data-error', 'true')
      bloque.textContent = `Diagrama invalido: ${error instanceof Error ? error.message : 'error desconocido'}`
    }
  }
}
