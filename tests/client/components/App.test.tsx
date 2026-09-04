// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { App } from '../../../src/client/components/App.js'

vi.mock('../../../src/client/mermaid.js', () => ({ renderMermaid: vi.fn().mockResolvedValue(undefined) }))

const { renderMermaid } = await import('../../../src/client/mermaid.js')

class EventSourceFalso {
  static instancias: EventSourceFalso[] = []
  onerror: ((evento: unknown) => void) | null = null
  onopen: ((evento: unknown) => void) | null = null
  cerrada = false

  constructor(public readonly url: string) {
    EventSourceFalso.instancias.push(this)
  }

  addEventListener(): void {}

  close(): void {
    this.cerrada = true
  }
}

function respuestaFalsa(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}

const arbolFalso = {
  root: '/proyecto/docs',
  tree: [{ type: 'document', path: 'guia/uso.md', title: 'Uso', readable: true }],
  rootIndex: null,
  rootTitle: null,
  defaultDoc: 'guia/uso.md',
}

const docFalso = {
  path: 'guia/uso.md',
  title: 'Uso',
  html: '<h1>Uso</h1>',
  headings: [],
  frontmatter: {},
  breadcrumb: [],
  warnings: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(renderMermaid).mockClear()
})

describe('App', () => {
  it('muestra un estado de error cuando falla la carga del arbol, en lugar de quedarse cargando', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fallo de red')))

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(/no se pudo cargar el indice de documentacion/i).length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('Cargando...')).toBeNull()
    expect(screen.queryByText('Cargando documento...')).toBeNull()
  })

  it('el visor recibe el tema nuevo cuando cambia el conmutador, sin quedarse con el valor leido al montar', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/tree') return Promise.resolve(respuestaFalsa(arbolFalso))
        return Promise.resolve(respuestaFalsa(docFalso))
      }),
    )
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-tema')

    render(<App />)

    await waitFor(() => expect(screen.getByText('Uso')).toBeTruthy())
    await waitFor(() => expect(vi.mocked(renderMermaid)).toHaveBeenCalled())
    expect(vi.mocked(renderMermaid).mock.calls.at(-1)?.[1]).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /tema/i }))

    await waitFor(() => expect(vi.mocked(renderMermaid).mock.calls.at(-1)?.[1]).toBe(false))
  })
})
