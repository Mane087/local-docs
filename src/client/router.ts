export interface Route {
  docPath: string | null
  hash: string | null
}

export function routeFromLocation(location: { pathname: string; hash: string }): Route {
  const ruta = decodeURIComponent(location.pathname).replace(/^\//, '')
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
