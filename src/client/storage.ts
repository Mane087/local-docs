/**
 * Lee y parsea un valor JSON guardado en `localStorage`.
 *
 * `esValido` es opcional: cuando se pasa, valida la FORMA del valor ya
 * parseado (no solo que sea JSON sintacticamente correcto). Un valor
 * sintacticamente valido pero con otra forma -manipulacion manual, una
 * extension del navegador, un cambio de esquema futuro- se trata igual que
 * JSON corrupto: se descarta y se devuelve `alternativo`.
 */
export function leerJson<T>(
  clave: string,
  alternativo: T,
  esValido?: (valor: unknown) => valor is T,
): T {
  try {
    const bruto = window.localStorage.getItem(clave)
    if (bruto === null) return alternativo
    const valor: unknown = JSON.parse(bruto)
    if (esValido && !esValido(valor)) return alternativo
    return valor as T
  } catch {
    return alternativo
  }
}

export function escribirJson(clave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Un almacenamiento no disponible no debe impedir el uso del visor.
  }
}
