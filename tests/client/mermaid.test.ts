// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMermaid } from '../../src/client/mermaid.js'

const inicializar = vi.fn()
const renderizar = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => inicializar(...args),
    render: (...args: unknown[]) => renderizar(...args),
  },
}))

beforeEach(() => {
  inicializar.mockReset()
  renderizar.mockReset()
})

describe('renderMermaid', () => {
  it('usa la fuente original del diagrama en un segundo renderizado tras cambiar de tema', async () => {
    const contenedor = document.createElement('div')
    const bloque = document.createElement('pre')
    bloque.className = 'mermaid'
    bloque.textContent = 'graph TD; A-->B;'
    contenedor.appendChild(bloque)

    renderizar.mockResolvedValue({ svg: '<svg>diagrama</svg>' })

    await renderMermaid(contenedor, false)
    expect(renderizar).toHaveBeenCalledTimes(1)
    expect(renderizar.mock.calls[0]?.[1]).toBe('graph TD; A-->B;')
    expect(bloque.innerHTML).toBe('<svg>diagrama</svg>')

    await renderMermaid(contenedor, true)
    expect(renderizar).toHaveBeenCalledTimes(2)
    expect(renderizar.mock.calls[1]?.[1]).toBe('graph TD; A-->B;')
    expect(inicializar).toHaveBeenLastCalledWith({ startOnLoad: false, theme: 'dark' })
  })

  it('un diagrama invalido muestra el error de sintaxis sin afectar al resto del documento', async () => {
    const contenedor = document.createElement('div')
    contenedor.innerHTML =
      '<p>Texto antes</p><pre class="mermaid">esto no es un diagrama</pre><p>Texto despues</p>'

    renderizar.mockRejectedValue(new Error('sintaxis invalida'))

    await renderMermaid(contenedor, false)

    const bloque = contenedor.querySelector('pre.mermaid') as HTMLElement
    expect(bloque.getAttribute('data-error')).toBe('true')
    expect(bloque.textContent).toContain('sintaxis invalida')

    const parrafos = Array.from(contenedor.querySelectorAll('p')).map((p) => p.textContent)
    expect(parrafos).toEqual(['Texto antes', 'Texto despues'])
  })
})
