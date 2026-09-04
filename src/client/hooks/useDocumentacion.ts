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

  useEffect(() => {
    fetchTree()
      .then(setArbol)
      .catch(() => setArbolError(true))
  }, [])

  useEffect(() => {
    return subscribeToEvents({
      onDocChanged: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      onDocRemoved: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      // Un arbol nuevo ya cambia de referencia en cada carga, asi que basta
      // con refrescarlo: al ser dependencia del efecto de carga del
      // documento de mas abajo, dispara por si solo la recarga necesaria.
      // Incrementar tambien `version` aqui pedia el documento visible dos
      // veces por el mismo cambio.
      onTreeChanged: () => {
        void fetchTree().then(setArbol)
      },
      onRootUnavailable: () => setRaizDisponible(false),
      onRootRestored: () => {
        setRaizDisponible(true)
        void fetchTree().then(setArbol)
      },
      onConnectionChange: setConectado,
    })
  }, [])

  useEffect(() => {
    if (arbol === null) return
    const objetivo = docPath ?? arbol.defaultDoc
    if (objetivo === null) {
      setDocumento({ estado: 'error', codigo: 404 })
      return
    }
    setDocumento({ estado: 'cargando' })
    fetchDoc(objetivo)
      .then((doc) => setDocumento({ estado: 'listo', documento: doc }))
      .catch((error: unknown) => {
        setDocumento({ estado: 'error', codigo: error instanceof ApiError ? error.status : 500 })
      })
  }, [arbol, docPath, version])

  return { arbol, arbolError, documento, raizDisponible, conectado }
}
