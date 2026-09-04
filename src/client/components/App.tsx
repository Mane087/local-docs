import { useEffect, useMemo, useState } from 'preact/hooks'
import { ApiError, fetchDoc, fetchTree } from '../api.js'
import { collectPaths } from '../links.js'
import { navigateTo, onRouteChange, routeFromLocation, type Route } from '../router.js'
import type { DocResponse, TreeResponse } from '../types.js'
import { Search } from './Search.js'
import { Sidebar } from './Sidebar.js'
import { Toc } from './Toc.js'
import { Viewer } from './Viewer.js'

type EstadoDocumento =
  | { estado: 'cargando' }
  | { estado: 'listo'; documento: DocResponse }
  | { estado: 'error'; codigo: number }

export function App() {
  const [arbol, setArbol] = useState<TreeResponse | null>(null)
  const [arbolError, setArbolError] = useState(false)
  const [ruta, setRuta] = useState<Route>(() => routeFromLocation(window.location))
  const [documento, setDocumento] = useState<EstadoDocumento>({ estado: 'cargando' })
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)

  useEffect(() => onRouteChange(setRuta), [])

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent): void => {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        setBusquedaAbierta(true)
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  useEffect(() => {
    fetchTree()
      .then(setArbol)
      .catch(() => setArbolError(true))
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

  const rutasConocidas = useMemo(
    () => (arbol === null ? new Set<string>() : collectPaths(arbol.tree, arbol.rootIndex)),
    [arbol],
  )
  const [encabezadoActivo, setEncabezadoActivo] = useState<string | null>(null)

  useEffect(() => {
    if (documento.estado !== 'listo') return
    const objetivos = documento.documento.headings
      .map((encabezado) => document.getElementById(encabezado.id))
      .filter((elemento): elemento is HTMLElement => elemento !== null)
    if (objetivos.length === 0) return

    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas.find((entrada) => entrada.isIntersecting)
        if (visible) setEncabezadoActivo(visible.target.id)
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    for (const objetivo of objetivos) observador.observe(objetivo)
    return () => observador.disconnect()
  }, [documento])

  useEffect(() => {
    if (documento.estado !== 'listo' || ruta.hash === null) return
    document.getElementById(ruta.hash)?.scrollIntoView()
  }, [documento, ruta.hash])

  return (
    <div class="disposicion">
      <aside class="sidebar">
        {arbolError ? (
          'No se pudo cargar el indice de documentacion.'
        ) : arbol === null ? (
          <p>Cargando indice...</p>
        ) : (
          <Sidebar
            nodes={arbol.tree}
            rootTitle={arbol.rootTitle}
            rootIndex={arbol.rootIndex}
            currentPath={ruta.docPath ?? arbol.defaultDoc}
            onNavigate={(destino) => navigateTo(destino)}
          />
        )}
      </aside>
      <main class="contenido">
        {arbolError ? (
          <p>No se pudo cargar el indice de documentacion.</p>
        ) : documento.estado === 'listo' ? (
          <Viewer
            doc={documento.documento}
            knownPaths={rutasConocidas}
            darkMode={document.documentElement.dataset.tema === 'oscuro'}
            onNavigate={(destino, ancla) => navigateTo(destino, ancla)}
          />
        ) : documento.estado === 'cargando' ? (
          <p>Cargando documento...</p>
        ) : (
          <p>No se pudo cargar el documento ({documento.codigo}).</p>
        )}
      </main>
      <nav class="toc" aria-label="Contenido del documento">
        {documento.estado === 'listo' ? (
          <Toc
            headings={documento.documento.headings}
            activeId={encabezadoActivo}
            onSelect={(id) => {
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
              navigateTo(documento.documento.path, id)
            }}
          />
        ) : null}
      </nav>
      <Search
        abierto={busquedaAbierta}
        onClose={() => setBusquedaAbierta(false)}
        onSelect={(destino) => {
          setBusquedaAbierta(false)
          navigateTo(destino)
        }}
      />
    </div>
  )
}
