import { useEffect, useState } from 'preact/hooks'
import type { EstadoDocumento } from './useDocumentacion.js'

/**
 * Observa los encabezados del documento visible y devuelve el id del que
 * esta mas cerca de la parte superior visible, para resaltarlo en la tabla
 * de contenidos.
 */
export function useEncabezadoActivo(documento: EstadoDocumento): string | null {
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

  return encabezadoActivo
}
