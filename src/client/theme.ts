const CLAVE = 'local-docs:tema'

export type Tema = 'claro' | 'oscuro' | 'sistema'

const VALIDOS: Tema[] = ['claro', 'oscuro', 'sistema']

export function leerTema(): Tema {
  try {
    const guardado = window.localStorage.getItem(CLAVE)
    return VALIDOS.includes(guardado as Tema) ? (guardado as Tema) : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function guardarTema(tema: Tema): void {
  try {
    window.localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento el tema simplemente no se recuerda.
  }
}

export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
  if (tema !== 'sistema') return tema
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute('data-tema', temaEfectivo(tema))
}
