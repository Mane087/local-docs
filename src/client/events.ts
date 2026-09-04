const ESPERA_INICIAL = 1000
const ESPERA_MAXIMA = 15000

export interface EventHandlers {
  onDocChanged(path: string): void
  onDocRemoved(path: string): void
  onTreeChanged(): void
  onRootUnavailable(): void
  onRootRestored(): void
  onConnectionChange(conectado: boolean): void
}

function leerRuta(evento: MessageEvent): string {
  try {
    const datos = JSON.parse(String(evento.data)) as { path?: string }
    return datos.path ?? ''
  } catch {
    return ''
  }
}

export function subscribeToEvents(handlers: EventHandlers): () => void {
  let fuente: EventSource | null = null
  let espera = ESPERA_INICIAL
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let cancelado = false

  const conectar = (): void => {
    if (cancelado) return
    const actual = new EventSource('/api/events')
    fuente = actual

    actual.addEventListener('doc-changed', (evento) => {
      handlers.onConnectionChange(true)
      handlers.onDocChanged(leerRuta(evento as MessageEvent))
    })
    actual.addEventListener('doc-removed', (evento) => {
      handlers.onDocRemoved(leerRuta(evento as MessageEvent))
    })
    actual.addEventListener('tree-changed', () => handlers.onTreeChanged())
    actual.addEventListener('root-unavailable', () => handlers.onRootUnavailable())
    actual.addEventListener('root-restored', () => handlers.onRootRestored())

    actual.onopen = () => {
      espera = ESPERA_INICIAL
      handlers.onConnectionChange(true)
    }

    actual.onerror = () => {
      handlers.onConnectionChange(false)
      actual.close()
      if (cancelado) return
      temporizador = setTimeout(conectar, espera)
      espera = Math.min(espera * 2, ESPERA_MAXIMA)
    }
  }

  conectar()

  return () => {
    cancelado = true
    if (temporizador !== null) clearTimeout(temporizador)
    fuente?.close()
  }
}
