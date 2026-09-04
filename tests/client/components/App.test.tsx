// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { App } from '../../../src/client/components/App.js'

vi.mock('../../../src/client/mermaid.js', () => ({ renderMermaid: vi.fn().mockResolvedValue(undefined) }))

const { renderMermaid } = await import('../../../src/client/mermaid.js')

class EventSourceFalso {
  static instancias: EventSourceFalso[] = []
  private readonly manejadores = new Map<string, (evento: MessageEvent) => void>()
  onerror: ((evento: unknown) => void) | null = null
  onopen: ((evento: unknown) => void) | null = null
  cerrada = false

  constructor(public readonly url: string) {
    EventSourceFalso.instancias.push(this)
  }

  addEventListener(tipo: string, manejador: (evento: MessageEvent) => void): void {
    this.manejadores.set(tipo, manejador)
  }

  close(): void {
    this.cerrada = true
  }

  emitir(tipo: string, datos: unknown): void {
    this.manejadores.get(tipo)?.(new MessageEvent(tipo, { data: JSON.stringify(datos) }))
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

beforeEach(() => {
  EventSourceFalso.instancias = []
})

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

    // La primera llamada tiene que llevar ya el valor correcto: si el estado
    // del tema dependiera de que otro componente aplique el atributo antes,
    // este render inicial podria pasar el valor equivocado y corregirse
    // recien despues.
    expect(vi.mocked(renderMermaid).mock.calls[0]?.[1]).toBe(true)
    expect(vi.mocked(renderMermaid).mock.calls.at(-1)?.[1]).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /tema/i }))

    await waitFor(() => expect(vi.mocked(renderMermaid).mock.calls.at(-1)?.[1]).toBe(false))
  })

  it('un cambio de arbol no vuelve a pedir el documento visible', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    let arbolServido = arbolFalso
    const fetchFalso = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tree') return Promise.resolve(respuestaFalsa(arbolServido))
      return Promise.resolve(respuestaFalsa(docFalso))
    })
    vi.stubGlobal('fetch', fetchFalso)
    const llamadasDoc = (): number =>
      fetchFalso.mock.calls.filter(([url]: [string]) => url.startsWith('/api/doc/')).length

    render(<App />)

    await waitFor(() => expect(llamadasDoc()).toBe(1))

    // El arbol nuevo trae un documento mas: esperar a que aparezca en el
    // sidebar demuestra que el arbol ya se sustituyo en el estado, de modo
    // que la comprobacion de abajo no se adelanta a la recarga.
    arbolServido = {
      ...arbolFalso,
      tree: [
        ...arbolFalso.tree,
        { type: 'document', path: 'guia/otro.md', title: 'Otro', readable: true },
      ],
    }
    const fuente = EventSourceFalso.instancias[0] as EventSourceFalso
    fuente.emitir('tree-changed', {})

    await waitFor(() => expect(screen.getByRole('link', { name: 'Otro' })).toBeTruthy())
    // Margen para que corran los efectos posteriores al render del arbol
    // nuevo: si alguno volviera a pedir el documento, la llamada aparece aqui.
    await new Promise((resolve) => setTimeout(resolve, 50))

    // La ruta visible no cambio, asi que el documento no se vuelve a pedir.
    // Recargarlo devolvia al lector al principio del documento cada vez que
    // se creaba o borraba cualquier archivo de docs/.
    expect(llamadasDoc()).toBe(1)
  })

  it('al recuperar la conexion refresca arbol y documento visible', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    const fetchFalso = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tree') return Promise.resolve(respuestaFalsa(arbolFalso))
      return Promise.resolve(respuestaFalsa(docFalso))
    })
    vi.stubGlobal('fetch', fetchFalso)
    const llamadasArbol = (): number =>
      fetchFalso.mock.calls.filter(([url]: [string]) => url === '/api/tree').length
    const llamadasDoc = (): number =>
      fetchFalso.mock.calls.filter(([url]: [string]) => url.startsWith('/api/doc/')).length

    render(<App />)

    await waitFor(() => expect(llamadasDoc()).toBe(1))

    const fuente = EventSourceFalso.instancias[0] as EventSourceFalso
    fuente.onopen?.({})
    fuente.onerror?.({})

    await waitFor(() => expect(screen.getByText(/sin conexion con el servidor/i)).toBeTruthy())

    await new Promise((resolve) => setTimeout(resolve, 1100))
    const segunda = EventSourceFalso.instancias[1] as EventSourceFalso
    segunda.onopen?.({})

    await waitFor(() => expect(llamadasArbol()).toBe(2))
    await waitFor(() => expect(llamadasDoc()).toBe(2))
    expect(screen.queryByText(/sin conexion con el servidor/i)).toBeNull()
  })

  it('recargar el mismo documento no pasa por el estado de carga', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    let resolverSegunda: ((valor: Response) => void) | null = null
    let peticionesDoc = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/tree') return Promise.resolve(respuestaFalsa(arbolFalso))
        peticionesDoc += 1
        if (peticionesDoc === 1) {
          return Promise.resolve(respuestaFalsa({ ...docFalso, html: '<p>version original</p>' }))
        }
        // La segunda peticion queda en vuelo a proposito: mientras tanto se
        // comprueba que la pantalla conserva el contenido anterior.
        return new Promise<Response>((resolver) => {
          resolverSegunda = resolver
        })
      }),
    )

    render(<App />)

    await waitFor(() => expect(screen.getByText('version original')).toBeTruthy())

    const fuente = EventSourceFalso.instancias[0] as EventSourceFalso
    fuente.emitir('doc-changed', { path: 'guia/uso.md' })

    await waitFor(() => expect(peticionesDoc).toBe(2))

    // El contenido anterior sigue en pantalla mientras llega el nuevo: si se
    // pasara por el estado de carga, el nodo del documento se destruiria y se
    // perderia la posicion de lectura.
    expect(screen.queryByText('Cargando documento...')).toBeNull()
    expect(screen.getByText('version original')).toBeTruthy()

    resolverSegunda?.(respuestaFalsa({ ...docFalso, html: '<p>version nueva</p>' }))

    await waitFor(() => expect(screen.getByText('version nueva')).toBeTruthy())
    expect(screen.queryByText('Cargando documento...')).toBeNull()
  })

  it('el boton de navegacion abre y cierra el sidebar, y navegar lo cierra', async () => {
    vi.stubGlobal('EventSource', EventSourceFalso)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/tree') return Promise.resolve(respuestaFalsa(arbolFalso))
        return Promise.resolve(respuestaFalsa(docFalso))
      }),
    )

    const { container } = render(<App />)

    const boton = screen.getByRole('button', { name: /abrir navegacion/i })
    const panel = container.querySelector('aside.sidebar') as HTMLElement

    expect(boton.getAttribute('aria-expanded')).toBe('false')
    expect(boton.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('data-abierto')).toBe('false')

    fireEvent.click(boton)

    expect(screen.getByRole('button', { name: /cerrar navegacion/i }).getAttribute('aria-expanded')).toBe('true')
    expect(panel.getAttribute('data-abierto')).toBe('true')

    // Navegar a un documento cierra el panel: en movil tapa el contenido.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Uso' })).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Uso' }))

    await waitFor(() => expect(panel.getAttribute('data-abierto')).toBe('false'))
  })
})
