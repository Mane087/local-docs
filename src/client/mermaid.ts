let cargado: Promise<typeof import('mermaid')> | null = null

export async function renderMermaid(container: HTMLElement, oscuro: boolean): Promise<void> {
  const bloques = Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (bloques.length === 0) return

  if (cargado === null) cargado = import('mermaid')
  const modulo = await cargado
  const mermaid = modulo.default

  mermaid.initialize({ startOnLoad: false, theme: oscuro ? 'dark' : 'default' })

  for (const [indice, bloque] of bloques.entries()) {
    const fuente = bloque.textContent ?? ''
    try {
      const { svg } = await mermaid.render(`mermaid-${Date.now()}-${indice}`, fuente)
      bloque.innerHTML = svg
      bloque.setAttribute('data-renderizado', 'true')
    } catch (error) {
      bloque.setAttribute('data-error', 'true')
      bloque.textContent = `Diagrama invalido: ${error instanceof Error ? error.message : 'error desconocido'}`
    }
  }
}
