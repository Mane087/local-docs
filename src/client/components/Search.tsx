import { useEffect, useRef, useState } from 'preact/hooks'
import { searchDocs } from '../api.js'
import type { SearchResponse, SearchResult } from '../types.js'

interface Props {
  abierto: boolean
  consulta: string
  onConsultaChange(consulta: string): void
  onClose(): void
  onSelect(path: string): void
}

const ID_LISTA = 'busqueda-resultados-lista'

function idOpcion(indice: number): string {
  return `busqueda-resultado-${indice}`
}

export function Search({ abierto, consulta, onConsultaChange, onClose, onSelect }: Props) {
  const [respuesta, setRespuesta] = useState<SearchResponse | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState(false)
  const [seleccionado, setSeleccionado] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)
  const disparador = useRef<Element | null>(null)

  useEffect(() => {
    if (abierto) {
      // Guardamos el elemento con foco antes de abrir el panel para
      // devolverle el foco al cerrar: un panel superpuesto no debe dejar el
      // foco perdido ni forzarlo de vuelta al principio del documento.
      disparador.current = document.activeElement
      entrada.current?.focus()
    } else {
      setRespuesta(null)
      setErrorBusqueda(false)
      setSeleccionado(0)
      if (disparador.current instanceof HTMLElement) disparador.current.focus()
      disparador.current = null
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto || consulta.trim() === '') {
      setRespuesta(null)
      setErrorBusqueda(false)
      return
    }
    let vigente = true
    const temporizador = setTimeout(() => {
      searchDocs(consulta)
        .then((resultado) => {
          if (!vigente) return
          setRespuesta(resultado)
          setErrorBusqueda(false)
          setSeleccionado(0)
        })
        .catch(() => {
          if (!vigente) return
          setRespuesta(null)
          setErrorBusqueda(true)
        })
    }, 120)

    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [abierto, consulta])

  if (!abierto) return null

  const resultados: SearchResult[] = respuesta?.results ?? []
  // El servidor acepta peticiones desde antes de terminar de construir el
  // indice: mientras esta en `indexing` no hay nada que buscar todavia, asi
  // que se informa del estado en lugar de mostrarse como "sin resultados".
  const indiceNoListo = respuesta?.status === 'indexing'

  // El foco real permanece siempre en la entrada; los resultados no son
  // focalizables por si mismos (no son <button>) sino que su seleccion se
  // comunica a la entrada mediante `aria-activedescendant` y a cada opcion
  // mediante `aria-selected`, el patron estandar de un campo que controla
  // una lista. Por eso la entrada sigue siendo el unico elemento realmente
  // enfocable del panel: como este es un dialogo modal (`aria-modal`), Tab
  // debe permanecer en ella en lugar de escapar hacia el contenido oculto
  // detras del fondo oscurecido.
  const alPulsarTecla = (evento: KeyboardEvent): void => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      onClose()
      return
    }
    if (evento.key === 'Tab') {
      evento.preventDefault()
      return
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setSeleccionado((previo) => Math.min(previo + 1, Math.max(resultados.length - 1, 0)))
      return
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setSeleccionado((previo) => Math.max(previo - 1, 0))
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      const elegido = resultados[seleccionado]
      if (elegido) onSelect(elegido.path)
    }
  }

  return (
    <div class="busqueda-fondo" onClick={onClose}>
      <div
        class="busqueda"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en la documentacion"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={entrada}
          type="search"
          role="searchbox"
          class="busqueda-entrada"
          placeholder="Buscar en la documentacion"
          value={consulta}
          aria-controls={ID_LISTA}
          aria-activedescendant={resultados.length > 0 ? idOpcion(seleccionado) : undefined}
          onInput={(evento) => onConsultaChange((evento.target as HTMLInputElement).value)}
          onKeyDown={alPulsarTecla}
        />
        {/* `role="status"` + `aria-live="polite"` anuncia a lectores de
            pantalla los cambios de estado sin mover el foco: la entrada lo
            conserva mientras el usuario escribe. */}
        {errorBusqueda ? (
          <p class="busqueda-estado" role="status" aria-live="polite">
            No se pudo completar la busqueda. Intentalo de nuevo.
          </p>
        ) : null}
        {!errorBusqueda && indiceNoListo ? (
          <p class="busqueda-estado" role="status" aria-live="polite">
            Indexando la documentacion, intentalo en unos segundos.
          </p>
        ) : null}
        {!errorBusqueda && respuesta?.status === 'ready' && resultados.length === 0 ? (
          <p class="busqueda-estado" role="status" aria-live="polite">
            Sin resultados para esta consulta.
          </p>
        ) : null}
        {!errorBusqueda && respuesta?.status === 'ready' && resultados.length > 0 ? (
          <p class="visualmente-oculto" role="status" aria-live="polite">
            {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para esta
            consulta.
          </p>
        ) : null}
        <ul id={ID_LISTA} class="busqueda-resultados" role="listbox" aria-label="Resultados de la busqueda">
          {resultados.map((resultado, indice) => (
            <li
              key={resultado.path}
              id={idOpcion(indice)}
              role="option"
              aria-selected={indice === seleccionado}
              class="resultado"
              onMouseEnter={() => setSeleccionado(indice)}
              onClick={() => onSelect(resultado.path)}
            >
              <span class="resultado-titulo">{resultado.title}</span>
              <span class="resultado-ruta">{resultado.path}</span>
              {resultado.fragments.map((fragmento, posicion) => (
                <span
                  class="resultado-fragmento"
                  key={posicion}
                  dangerouslySetInnerHTML={{ __html: fragmento }}
                />
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
