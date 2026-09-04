import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ApiError, fetchDoc, fetchTree } from '../api.js'
import { subscribeToEvents } from '../events.js'
import { collectPaths } from '../links.js'
import { navigateTo, onRouteChange, routeFromLocation, type Route } from '../router.js'
import { leerTema, temaEfectivo } from '../theme.js'
import type { DocResponse, TreeResponse } from '../types.js'
import { Search } from './Search.js'
import { Sidebar } from './Sidebar.js'
import { DocumentacionNoDisponible, ErrorDocumento, EstadoVacio, SinConexion } from './States.js'
import { ThemeToggle } from './ThemeToggle.js'
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
  const [conectado, setConectado] = useState(true)
  const [raizDisponible, setRaizDisponible] = useState(true)
  const [version, setVersion] = useState(0)
  // El tema efectivo se lee una vez al montar y despues se mantiene en este
  // estado, sincronizado con el atributo `data-tema` (ver el observador mas
  // abajo). El visor necesita este valor como estado reactivo: si se leyera
  // el atributo del documento directamente en cada render, un cambio de tema
  // que no provoque una actualizacion de este componente nunca llegaria al
  // visor y los diagramas Mermaid se quedarian con la paleta anterior.
  const [temaOscuro, setTemaOscuro] = useState(() => temaEfectivo(leerTema()) === 'oscuro')

  useEffect(() => onRouteChange(setRuta), [])

  useEffect(() => {
    const raiz = document.documentElement
    const sincronizar = (): void => setTemaOscuro(raiz.dataset.tema === 'oscuro')
    sincronizar()
    const observador = new MutationObserver(sincronizar)
    observador.observe(raiz, { attributes: true, attributeFilter: ['data-tema'] })
    return () => observador.disconnect()
  }, [])

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

  const rutaActualRef = useRef<string | null>(null)
  useEffect(() => {
    rutaActualRef.current = ruta.docPath ?? arbol?.defaultDoc ?? null
  }, [ruta.docPath, arbol])

  useEffect(() => {
    return subscribeToEvents({
      onDocChanged: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      onDocRemoved: (ruta) => {
        if (ruta === (rutaActualRef.current ?? '')) setVersion((v) => v + 1)
      },
      onTreeChanged: () => {
        void fetchTree().then(setArbol)
        setVersion((v) => v + 1)
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
  }, [arbol, ruta.docPath, version])

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
        <div class="sidebar-cabecera">
          <ThemeToggle />
          {conectado ? null : <SinConexion />}
        </div>
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
        ) : !raizDisponible ? (
          <DocumentacionNoDisponible />
        ) : arbol !== null && arbol.tree.length === 0 && arbol.rootIndex === null ? (
          <EstadoVacio root={arbol.root} />
        ) : documento.estado === 'listo' ? (
          <Viewer
            doc={documento.documento}
            knownPaths={rutasConocidas}
            darkMode={temaOscuro}
            onNavigate={(destino, ancla) => navigateTo(destino, ancla)}
          />
        ) : documento.estado === 'cargando' ? (
          <p>Cargando documento...</p>
        ) : (
          <ErrorDocumento
            codigo={documento.codigo}
            onInicio={() => {
              if (arbol?.defaultDoc) navigateTo(arbol.defaultDoc)
            }}
          />
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
