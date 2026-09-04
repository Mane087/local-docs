// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeToEvents } from '../../src/client/events.js'

class EventSourceFalso {
  static instancias: EventSourceFalso[] = []
  readonly manejadores = new Map<string, (evento: MessageEvent) => void>()
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

function manejadoresFalsos() {
  return {
    onDocChanged: vi.fn(),
    onDocRemoved: vi.fn(),
    onTreeChanged: vi.fn(),
    onRootUnavailable: vi.fn(),
    onRootRestored: vi.fn(),
    onConnectionChange: vi.fn(),
    onReconnect: vi.fn(),
  }
}

beforeEach(() => {
  EventSourceFalso.instancias = []
  vi.stubGlobal('EventSource', EventSourceFalso)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('subscribeToEvents', () => {
  it('se conecta al flujo de eventos del servidor', () => {
    subscribeToEvents(manejadoresFalsos())

    expect(EventSourceFalso.instancias[0]?.url).toBe('/api/events')
  })

  it('reparte cada tipo de evento a su manejador', () => {
    const manejadores = manejadoresFalsos()
    subscribeToEvents(manejadores)
    const fuente = EventSourceFalso.instancias[0] as EventSourceFalso

    fuente.emitir('doc-changed', { path: 'guia/uso.md' })
    fuente.emitir('doc-removed', { path: 'guia/viejo.md' })
    fuente.emitir('tree-changed', {})
    fuente.emitir('root-unavailable', {})
    fuente.emitir('root-restored', {})

    expect(manejadores.onDocChanged).toHaveBeenCalledWith('guia/uso.md')
    expect(manejadores.onDocRemoved).toHaveBeenCalledWith('guia/viejo.md')
    expect(manejadores.onTreeChanged).toHaveBeenCalled()
    expect(manejadores.onRootUnavailable).toHaveBeenCalled()
    expect(manejadores.onRootRestored).toHaveBeenCalled()
  })

  it('avisa de la perdida de conexion y vuelve a intentarlo', () => {
    vi.useFakeTimers()
    const manejadores = manejadoresFalsos()
    subscribeToEvents(manejadores)
    const primera = EventSourceFalso.instancias[0] as EventSourceFalso

    primera.onerror?.({})

    expect(manejadores.onConnectionChange).toHaveBeenCalledWith(false)
    expect(primera.cerrada).toBe(true)

    vi.advanceTimersByTime(1000)

    expect(EventSourceFalso.instancias).toHaveLength(2)
  })

  it('avisa de conexion recuperada desde cualquier tipo de evento, no solo desde uno', () => {
    const tipos = ['doc-changed', 'doc-removed', 'tree-changed', 'root-unavailable', 'root-restored']

    for (const tipo of tipos) {
      EventSourceFalso.instancias = []
      const manejadores = manejadoresFalsos()
      subscribeToEvents(manejadores)
      const fuente = EventSourceFalso.instancias[0] as EventSourceFalso

      fuente.emitir(tipo, { path: 'guia/uso.md' })

      expect(manejadores.onConnectionChange, tipo).toHaveBeenCalledWith(true)
    }
  })

  it('distingue la conexion inicial de una reconexion', () => {
    vi.useFakeTimers()
    const manejadores = manejadoresFalsos()
    subscribeToEvents(manejadores)
    const primera = EventSourceFalso.instancias[0] as EventSourceFalso

    primera.onopen?.({})

    expect(manejadores.onReconnect).not.toHaveBeenCalled()

    primera.onerror?.({})
    vi.advanceTimersByTime(1000)
    const segunda = EventSourceFalso.instancias[1] as EventSourceFalso
    segunda.onopen?.({})

    expect(manejadores.onReconnect).toHaveBeenCalledTimes(1)
  })

  it('cierra el flujo al cancelar la suscripcion', () => {
    const cancelar = subscribeToEvents(manejadoresFalsos())
    const fuente = EventSourceFalso.instancias[0] as EventSourceFalso

    cancelar()

    expect(fuente.cerrada).toBe(true)
  })
})
