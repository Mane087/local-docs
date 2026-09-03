export function leerJson<T>(clave: string, alternativo: T): T {
  try {
    const bruto = window.localStorage.getItem(clave)
    if (bruto === null) return alternativo
    return JSON.parse(bruto) as T
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
