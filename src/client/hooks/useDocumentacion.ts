import { useEffect, useRef, useState } from 'preact/hooks'
import { ApiError, fetchDoc, fetchTree } from '../api.js'
import { subscribeToEvents } from '../events.js'
import type { DocResponse, TreeResponse } from '../types.js'

export type EstadoDocumento =
  | { estado: 'cargando' }
  | { estado: 'listo'; documento: DocResponse }
  | { estado: 'error'; codigo: number }

export interface Documentacion {
  arbol: TreeResponse | null
  arbolError: boolean
  documento: EstadoDocumento
  raizDisponible: boolean
  conectado: boolean
}

/**
 * Agrupa el estado y los efectos de la documentacion servida: la carga del
 * arbol y del documento visible, la disponibilidad de la raiz, el estado de
 * conexion y la recarga en vivo ante los eventos del servidor.
 *
 * `docPath` es la ruta de documento que pide la URL actual (o `null` cuando
 * la URL no fija ninguna, en cuyo caso se usa el documento por omision del
 * arbol una vez cargado).
 */
export function useDocumentacion(docPath: string | null): Documentacion {
  const [arbol, setArbol] = useState<TreeResponse | null>(null)
  const [arbolError, setArbolError] = useState(false)
  const [documento, setDocumento] = useState<EstadoDocumento>({ estado: 'cargando' })
  const [raizDisponible, setRaizDisponible] = useState(true)
  const [conectado, setConectado] = useState(true)
  const [version, setVersion] = useState(0)

  // La suscripcion a eventos vive en un efecto de montaje unico y no debe
  // reconectarse cada vez que cambia la ruta visible, asi que esta se lee de
  // una referencia en lugar de figurar en las dependencias del efecto.
  const rutaActualRef = useRef<string | null>(null)
  useEffect(() => {
    rutaActualRef.current = docPath ?? arbol?.defaultDoc ?? null
  }, [docPath, arbol])

  // Todas las cargas del arbol pasan por aqui, con la misma captura de error:
  // sin ella un fallo de red en un refresco producia un rechazo sin capturar.
  const refrescarArbol = (): void => {
    void fetchTree()
      .then(setArbol)
      .catch(() => setArbolError(true))
  }

  useEffect(() => {
    refrescarArbol()
  }, [])

  useEffect(() => {
    return subscribeToEvents({
      onDocChanged: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      onDocRemoved: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      // El arbol se refresca, pero eso ya no arrastra al documento visible: el
      // efecto de carga de mas abajo depende de la ruta objetivo, no de la
      // referencia del arbol. Un alta o baja de otro archivo (o el par
      // baja+alta que produce un editor que guarda de forma atomica) dejaba
      // antes al lector al principio del documento que estaba leyendo.
      onTreeChanged: () => {
        refrescarArbol()
      },
      onRootUnavailable: () => setRaizDisponible(false),
      onRootRestored: () => {
        setRaizDisponible(true)
        refrescarArbol()
        // La raiz pudo reaparecer con otro contenido, asi que el documento
        // visible se vuelve a pedir explicitamente.
        setVersion((v) => v + 1)
      },
      onConnectionChange: setConectado,
      // Durante la caida no llego ningun evento: al recuperar la conexion se
      // refrescan arbol y documento visible (seccion 9.2 del spec).
      onReconnect: () => {
        refrescarArbol()
        setVersion((v) => v + 1)
      },
    })
  }, [])

  const arbolCargado = arbol !== null
  const objetivo = docPath ?? arbol?.defaultDoc ?? null

  useEffect(() => {
    if (!arbolCargado) return
    if (objetivo === null) {
      setDocumento({ estado: 'error', codigo: 404 })
      return
    }

    // Recargar el mismo documento no pasa por el estado de carga: se sustituye
    // el contenido cuando llega el nuevo, para no descartar el nodo del DOM y
    // conservar la posicion de desplazamiento (seccion 4.7 del spec).
    setDocumento((previo) =>
      previo.estado === 'listo' && previo.documento.path === objetivo ? previo : { estado: 'cargando' },
    )

    let vigente = true
    fetchDoc(objetivo)
      .then((doc) => {
        if (vigente) setDocumento({ estado: 'listo', documento: doc })
      })
      .catch((error: unknown) => {
        if (!vigente) return
        setDocumento({ estado: 'error', codigo: error instanceof ApiError ? error.status : 500 })
      })

    return () => {
      vigente = false
    }
  }, [arbolCargado, objetivo, version])

  return { arbol, arbolError, documento, raizDisponible, conectado }
}
