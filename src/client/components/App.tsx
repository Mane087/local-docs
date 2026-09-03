import { useEffect, useState } from 'preact/hooks'
import { ApiError, fetchDoc, fetchTree } from '../api.js'
import { onRouteChange, routeFromLocation, type Route } from '../router.js'
import type { DocResponse, TreeResponse } from '../types.js'

type EstadoDocumento =
  | { estado: 'cargando' }
  | { estado: 'listo'; documento: DocResponse }
  | { estado: 'error'; codigo: number }

export function App() {
  const [arbol, setArbol] = useState<TreeResponse | null>(null)
  const [ruta, setRuta] = useState<Route>(() => routeFromLocation(window.location))
  const [documento, setDocumento] = useState<EstadoDocumento>({ estado: 'cargando' })

  useEffect(() => onRouteChange(setRuta), [])

  useEffect(() => {
    void fetchTree().then(setArbol)
  }, [])

  useEffect(() => {
    if (arbol === null) return
    const objetivo = ruta.docPath ?? arbol.defaultDoc
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
  }, [arbol, ruta.docPath])

  return (
    <div class="disposicion">
      <aside class="sidebar">{arbol === null ? 'Cargando...' : arbol.root}</aside>
      <main class="contenido">
        {documento.estado === 'listo' ? (
          <div dangerouslySetInnerHTML={{ __html: documento.documento.html }} />
        ) : documento.estado === 'cargando' ? (
          <p>Cargando documento...</p>
        ) : (
          <p>No se pudo cargar el documento ({documento.codigo}).</p>
        )}
      </main>
      <nav class="toc" />
    </div>
  )
}
