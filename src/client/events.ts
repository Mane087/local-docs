const ESPERA_INICIAL = 1000
const ESPERA_MAXIMA = 15000

export interface EventHandlers {
  onDocChanged(path: string): void
  onDocRemoved(path: string): void
  onTreeChanged(): void
  onRootUnavailable(): void
  onRootRestored(): void
  onConnectionChange(conectado: boolean): void
  /**
   * Se invoca cuando el flujo vuelve a abrirse despues de haber estado
   * abierto antes. Durante la caida no llega ningun evento, asi que el estado
   * mostrado puede haber quedado obsoleto y el llamador tiene que refrescarlo
   * (seccion 9.2 del spec). No se invoca en la conexion inicial, donde el
   * cliente acaba de pedir los datos por su cuenta.
   */
  onReconnect(): void
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
  let yaSeAbrio = false

  const conectar = (): void => {
    if (cancelado) return
    const actual = new EventSource('/api/events')
    fuente = actual

    // Recibir cualquier evento demuestra que el flujo esta vivo, asi que el
    // aviso de conexion recuperada se emite desde todos los manejadores por
    // igual y no solo desde uno de ellos.
    const escuchar = (tipo: string, manejar: (evento: MessageEvent) => void): void => {
      actual.addEventListener(tipo, (evento) => {
        handlers.onConnectionChange(true)
        manejar(evento as MessageEvent)
      })
    }

    escuchar('doc-changed', (evento) => handlers.onDocChanged(leerRuta(evento)))
    escuchar('doc-removed', (evento) => handlers.onDocRemoved(leerRuta(evento)))
    escuchar('tree-changed', () => handlers.onTreeChanged())
    escuchar('root-unavailable', () => handlers.onRootUnavailable())
    escuchar('root-restored', () => handlers.onRootRestored())

    actual.onopen = () => {
      espera = ESPERA_INICIAL
      handlers.onConnectionChange(true)
      // Una apertura que no es la primera es una reconexion: mientras el flujo
      // estuvo caido se perdieron todos los eventos.
      if (yaSeAbrio) handlers.onReconnect()
      yaSeAbrio = true
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
