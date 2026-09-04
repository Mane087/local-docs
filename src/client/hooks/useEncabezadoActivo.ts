import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { EstadoDocumento } from './useDocumentacion.js'

/** Distancia desde el borde superior a partir de la cual un encabezado cuenta como alcanzado. */
const UMBRAL = 120

/**
 * Tiempo durante el cual una seleccion manual manda sobre el desplazamiento.
 * Al pulsar un encabezado en la tabla de contenidos el navegador se desplaza
 * de forma suave, y durante ese trayecto pasan por el umbral los encabezados
 * intermedios; sin esta ventana, el resaltado saltaria entre ellos y acabaria
 * en el equivocado cuando dos titulos estan muy juntos.
 */
const ESPERA_TRAS_SELECCION = 800

/**
 * Devuelve el encabezado que corresponde resaltar en la tabla de contenidos:
 * el ultimo cuyo borde superior ya ha pasado el umbral. Se calcula por
 * posicion y no por interseccion, porque dos encabezados consecutivos pueden
 * estar dentro de la misma banda visible y entonces el orden de las entradas
 * decide el resultado en lugar de la posicion real.
 */
export function useEncabezadoActivo(documento: EstadoDocumento): {
  encabezadoActivo: string | null
  fijarEncabezadoActivo: (id: string) => void
} {
  const [encabezadoActivo, setEncabezadoActivo] = useState<string | null>(null)
  const seleccionManualHasta = useRef(0)

  const fijarEncabezadoActivo = useCallback((id: string) => {
    seleccionManualHasta.current = Date.now() + ESPERA_TRAS_SELECCION
    setEncabezadoActivo(id)
  }, [])

  useEffect(() => {
    if (documento.estado !== 'listo') return

    const identificadores = documento.documento.headings.map((encabezado) => encabezado.id)
    if (identificadores.length === 0) {
      setEncabezadoActivo(null)
      return
    }

    let pendiente = false

    const calcular = (): void => {
      pendiente = false
      if (Date.now() < seleccionManualHasta.current) return

      let alcanzado: string | null = null
      for (const id of identificadores) {
        const elemento = document.getElementById(id)
        if (elemento === null) continue
        if (elemento.getBoundingClientRect().top > UMBRAL) break
        alcanzado = id
      }

      setEncabezadoActivo(alcanzado ?? identificadores[0] ?? null)
    }

    const alDesplazar = (): void => {
      if (pendiente) return
      pendiente = true
      requestAnimationFrame(calcular)
    }

    calcular()
    window.addEventListener('scroll', alDesplazar, { passive: true })
    window.addEventListener('resize', alDesplazar)

    return () => {
      window.removeEventListener('scroll', alDesplazar)
      window.removeEventListener('resize', alDesplazar)
    }
  }, [documento])

  return { encabezadoActivo, fijarEncabezadoActivo }
}
