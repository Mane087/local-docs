import { useEffect, useRef, useState } from 'preact/hooks'
import { searchDocs } from '../api.js'
import type { SearchResponse, SearchResult } from '../types.js'

interface Props {
  abierto: boolean
  onClose(): void
  onSelect(path: string): void
}

export function Search({ abierto, onClose, onSelect }: Props) {
  const [consulta, setConsulta] = useState('')
  const [respuesta, setRespuesta] = useState<SearchResponse | null>(null)
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
      setConsulta('')
      setRespuesta(null)
      setSeleccionado(0)
      if (disparador.current instanceof HTMLElement) disparador.current.focus()
      disparador.current = null
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto || consulta.trim() === '') {
      setRespuesta(null)
      return
    }
    let vigente = true
    const temporizador = setTimeout(() => {
      void searchDocs(consulta).then((resultado) => {
        if (vigente) {
          setRespuesta(resultado)
          setSeleccionado(0)
        }
      })
    }, 120)

    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [abierto, consulta])

  if (!abierto) return null

  const resultados: SearchResult[] = respuesta?.results ?? []

  // El foco no debe poder escapar del panel mientras esta abierto: con un
  // solo campo enfocable (la entrada de busqueda), Tab y Shift+Tab deben
  // mantenerlo ahi en lugar de salir hacia el resto de la pagina.
  const retenerFoco = (evento: KeyboardEvent): void => {
    if (evento.key !== 'Tab') return
    evento.preventDefault()
    entrada.current?.focus()
  }

  const alPulsarTecla = (evento: KeyboardEvent): void => {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      onClose()
      return
    }
    if (evento.key === 'Tab') {
      retenerFoco(evento)
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
          onInput={(evento) => setConsulta((evento.target as HTMLInputElement).value)}
          onKeyDown={alPulsarTecla}
        />
        {/* `role="status"` + `aria-live="polite"` anuncia a lectores de
            pantalla los cambios de estado sin mover el foco: la entrada lo
            conserva mientras el usuario escribe. */}
        {respuesta?.status === 'indexing' ? (
          <p class="busqueda-estado" role="status" aria-live="polite">
            Indexando la documentacion, intentalo en unos segundos.
          </p>
        ) : null}
        {respuesta?.status === 'ready' && resultados.length === 0 ? (
          <p class="busqueda-estado" role="status" aria-live="polite">
            Sin resultados para esta consulta.
          </p>
        ) : null}
        {respuesta?.status === 'ready' && resultados.length > 0 ? (
          <p class="visualmente-oculto" role="status" aria-live="polite">
            {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'} para esta
            consulta.
          </p>
        ) : null}
        <ul class="busqueda-resultados">
          {resultados.map((resultado, indice) => (
            <li key={resultado.path}>
              <button
                type="button"
                class="resultado"
                data-seleccionado={indice === seleccionado ? 'true' : 'false'}
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
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
