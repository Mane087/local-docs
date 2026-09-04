export interface Route {
  docPath: string | null
  hash: string | null
}

// Una URL con un porcentaje invalido (por ejemplo /%E0%A4%A) hace que
// decodeURIComponent lance: sin proteccion la excepcion sube desde el render
// inicial y la aplicacion se queda en blanco. Se conserva el texto tal cual,
// que el servidor ya rechaza con 400 al pedir el documento.
function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor)
  } catch {
    return valor
  }
}

export function routeFromLocation(location: { pathname: string; hash: string }): Route {
  const ruta = decodificar(location.pathname).replace(/^\//, '')
  const ancla = location.hash.replace(/^#/, '')
  return {
    docPath: ruta === '' ? null : ruta,
    hash: ancla === '' ? null : ancla,
  }
}

export function docUrl(docPath: string, hash?: string | null): string {
  const ruta = docPath.split('/').map(encodeURIComponent).join('/')
  return hash ? `/${ruta}#${hash}` : `/${ruta}`
}

export function navigateTo(docPath: string, hash?: string | null): void {
  const url = docUrl(docPath, hash)
  if (url !== window.location.pathname + window.location.hash) {
    window.history.pushState({}, '', url)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const escuchar = (): void => handler(routeFromLocation(window.location))
  window.addEventListener('popstate', escuchar)
  return () => window.removeEventListener('popstate', escuchar)
}
