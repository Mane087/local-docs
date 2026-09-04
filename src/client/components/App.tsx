import { useEffect, useMemo, useState } from 'preact/hooks'
import { useDocumentacion } from '../hooks/useDocumentacion.js'
import { useEncabezadoActivo } from '../hooks/useEncabezadoActivo.js'
import { escribiendoTexto, sinModificadores } from '../dom.js'
import { collectPaths } from '../links.js'
import { navigateTo, onRouteChange, routeFromLocation, type Route } from '../router.js'
import { escribirJson, leerJson } from '../storage.js'
import { aplicarTema, guardarTema, leerTema, temaEfectivo, type Tema } from '../theme.js'
import { Search } from './Search.js'
import { Sidebar } from './Sidebar.js'
import { DocumentacionNoDisponible, ErrorDocumento, EstadoVacio, SinConexion } from './States.js'
import { ThemeToggle } from './ThemeToggle.js'
import { Toc } from './Toc.js'
import { Viewer } from './Viewer.js'

// Los dos paneles laterales se pueden ocultar para leer sin distracciones, y
// la eleccion se recuerda. Por debajo de 900px el sidebar es ademas un panel
// deslizable (seccion 8.6 del spec), asi que ahi arranca cerrado aunque la
// preferencia guardada diga lo contrario: abierto taparia el documento.
const CLAVE_SIDEBAR = 'local-docs:sidebar-visible'
const CLAVE_TOC = 'local-docs:toc-visible'

const esBooleano = (valor: unknown): valor is boolean => typeof valor === 'boolean'

export function App() {
  const [ruta, setRuta] = useState<Route>(() => routeFromLocation(window.location))
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    if (window.matchMedia('(max-width: 900px)').matches) return false
    return leerJson(CLAVE_SIDEBAR, true, esBooleano)
  })
  const [tocVisible, setTocVisible] = useState<boolean>(() => leerJson(CLAVE_TOC, true, esBooleano))
  const [tema, setTema] = useState<Tema>(() => leerTema())
  // El indicador que recibe el visor sale de la misma llamada que escribe el
  // atributo del documento (ver `fijarTema` mas abajo), asi que las dos
  // nunca pueden divergir ni dependen del orden en que se monten otros
  // componentes.
  const [temaOscuro, setTemaOscuro] = useState<boolean>(() => temaEfectivo(tema) === 'oscuro')

  useEffect(() => onRouteChange(setRuta), [])

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent): void => {
      // La busqueda usa la tecla de comando en macOS y control en Windows y
      // Linux, que es la convencion en los tres sistemas.
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        setBusquedaAbierta(true)
        return
      }

      // Los paneles se alternan con una sola tecla: las combinaciones con
      // modificador que resultarian mnemotecnicas ya estan tomadas por los
      // navegadores (las herramientas de desarrollo, los marcadores o el
      // historial), y varian entre sistemas. Se comprueba `code` en lugar de
      // `key` para que la tecla sea la misma posicion fisica en cualquier
      // distribucion de teclado.
      if (evento.repeat || !sinModificadores(evento) || escribiendoTexto(evento.target)) return

      if (evento.code === 'KeyI') {
        evento.preventDefault()
        setSidebarVisible((visible) => !visible)
        return
      }

      if (evento.code === 'KeyC') {
        evento.preventDefault()
        setTocVisible((visible) => !visible)
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
    escribirJson(CLAVE_SIDEBAR, sidebarVisible)
  }, [sidebarVisible])

  useEffect(() => {
    escribirJson(CLAVE_TOC, tocVisible)
  }, [tocVisible])

  useEffect(() => {
    if (tema !== 'sistema') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (): void => fijarTema('sistema')
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [tema])

  const { arbol, arbolError, documento, raizDisponible, conectado } = useDocumentacion(ruta.docPath)
  const { encabezadoActivo, fijarEncabezadoActivo } = useEncabezadoActivo(documento)

  const rutasConocidas = useMemo(
    () => (arbol === null ? new Set<string>() : collectPaths(arbol.tree, arbol.rootIndex)),
    [arbol],
  )

  useEffect(() => {
    if (documento.estado !== 'listo' || ruta.hash === null) return
    document.getElementById(ruta.hash)?.scrollIntoView()
  }, [documento, ruta.hash])

  return (
    <div
      class="disposicion"
      data-sidebar={sidebarVisible ? 'visible' : 'oculto'}
      data-toc={tocVisible ? 'visible' : 'oculto'}
    >
      <header class="barra">
        <button
          type="button"
          class="alternar"
          aria-pressed={sidebarVisible}
          aria-controls="sidebar-navegacion"
          aria-keyshortcuts="i"
          title="Alternar el indice lateral (tecla I)"
          onClick={() => setSidebarVisible((visible) => !visible)}
        >
          {sidebarVisible ? 'Ocultar indice' : 'Mostrar indice'}
        </button>
        <span class="barra-separador" />
        <button
          type="button"
          class="alternar"
          aria-pressed={tocVisible}
          aria-controls="toc-documento"
          aria-keyshortcuts="c"
          title="Alternar el contenido de la pagina (tecla C)"
          onClick={() => setTocVisible((visible) => !visible)}
        >
          {tocVisible ? 'Ocultar contenido' : 'Mostrar contenido'}
        </button>
        <ThemeToggle tema={tema} onChange={setTema} />
      </header>
      <aside id="sidebar-navegacion" class="sidebar">
        <div class="sidebar-cabecera">{conectado ? null : <SinConexion />}</div>
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
              // En movil el sidebar tapa el contenido, asi que navegar lo
              // cierra: dejarlo abierto ocultaria el documento recien elegido.
              if (window.matchMedia('(max-width: 900px)').matches) setSidebarVisible(false)
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
      <nav id="toc-documento" class="toc" aria-label="Contenido del documento">
        {documento.estado === 'listo' ? (
          <Toc
            headings={documento.documento.headings}
            activeId={encabezadoActivo}
            onSelect={(id) => {
              const destino = document.getElementById(id)
              // El resaltado se fija aqui y no se deja al calculo por
              // desplazamiento: entre dos encabezados contiguos, el segundo
              // nunca llega a alcanzar el umbral por si solo.
              fijarEncabezadoActivo(id)
              destino?.scrollIntoView({ behavior: 'smooth' })
              // Sin foco real, quien navega con teclado o lector de pantalla
              // se queda donde estaba aunque la pagina se haya desplazado.
              destino?.focus({ preventScroll: true })
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
