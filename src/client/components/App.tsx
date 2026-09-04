import { useEffect, useMemo, useState } from 'preact/hooks'
import { useDocumentacion } from '../hooks/useDocumentacion.js'
import { useEncabezadoActivo } from '../hooks/useEncabezadoActivo.js'
import { collectPaths } from '../links.js'
import { navigateTo, onRouteChange, routeFromLocation, type Route } from '../router.js'
import { aplicarTema, guardarTema, leerTema, temaEfectivo, type Tema } from '../theme.js'
import { Search } from './Search.js'
import { Sidebar } from './Sidebar.js'
import { DocumentacionNoDisponible, ErrorDocumento, EstadoVacio, SinConexion } from './States.js'
import { ThemeToggle } from './ThemeToggle.js'
import { Toc } from './Toc.js'
import { Viewer } from './Viewer.js'

export function App() {
  const [ruta, setRuta] = useState<Route>(() => routeFromLocation(window.location))
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)
  // Por debajo de 900px el sidebar se convierte en un panel deslizable
  // (seccion 8.6 del spec): el atributo lo lee la hoja de estilos y el boton
  // de alternancia solo es visible en ese punto de ruptura. Por encima, el
  // sidebar siempre esta a la vista y el atributo no tiene efecto.
  const [sidebarAbierto, setSidebarAbierto] = useState(false)
  const [tema, setTema] = useState<Tema>(() => leerTema())
  // El indicador que recibe el visor sale de la misma llamada que escribe el
  // atributo del documento (ver `fijarTema` mas abajo), asi que las dos
  // nunca pueden divergir ni dependen del orden en que se monten otros
  // componentes.
  const [temaOscuro, setTemaOscuro] = useState<boolean>(() => temaEfectivo(tema) === 'oscuro')

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

  const fijarTema = (valor: Tema): void => {
    aplicarTema(valor)
    setTemaOscuro(temaEfectivo(valor) === 'oscuro')
  }

  useEffect(() => {
    fijarTema(tema)
    guardarTema(tema)
  }, [tema])

  useEffect(() => {
    if (tema !== 'sistema') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (): void => fijarTema('sistema')
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [tema])

  const { arbol, arbolError, documento, raizDisponible, conectado } = useDocumentacion(ruta.docPath)
  const encabezadoActivo = useEncabezadoActivo(documento)

  const rutasConocidas = useMemo(
    () => (arbol === null ? new Set<string>() : collectPaths(arbol.tree, arbol.rootIndex)),
    [arbol],
  )

  useEffect(() => {
    if (documento.estado !== 'listo' || ruta.hash === null) return
    document.getElementById(ruta.hash)?.scrollIntoView()
  }, [documento, ruta.hash])

  return (
    <div class="disposicion">
      <button
        type="button"
        class="alternar-sidebar"
        aria-expanded={sidebarAbierto}
        aria-controls="sidebar-navegacion"
        aria-label={sidebarAbierto ? 'Cerrar navegacion' : 'Abrir navegacion'}
        onClick={() => setSidebarAbierto((abierto) => !abierto)}
      >
        {sidebarAbierto ? '\u2715' : '\u2630'}
      </button>
      <aside id="sidebar-navegacion" class="sidebar" data-abierto={sidebarAbierto ? 'true' : 'false'}>
        <div class="sidebar-cabecera">
          <ThemeToggle tema={tema} onChange={setTema} />
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
            onNavigate={(destino) => {
              // Navegar cierra el panel: en movil el sidebar tapa el
              // contenido, asi que dejarlo abierto ocultaria el documento
              // recien elegido.
              setSidebarAbierto(false)
              navigateTo(destino)
            }}
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
