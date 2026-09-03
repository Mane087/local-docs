import type { DocResponse, SearchResponse, TreeResponse } from './types.js'

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`La peticion fallo con estado ${status}`)
    this.name = 'ApiError'
  }
}

function codificarRuta(ruta: string): string {
  return ruta.split('/').map(encodeURIComponent).join('/')
}

async function pedir<T>(url: string): Promise<T> {
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new ApiError(respuesta.status)
  return (await respuesta.json()) as T
}

export function fetchTree(): Promise<TreeResponse> {
  return pedir<TreeResponse>('/api/tree')
}

export function fetchDoc(path: string): Promise<DocResponse> {
  return pedir<DocResponse>(`/api/doc/${codificarRuta(path)}`)
}

export function searchDocs(query: string): Promise<SearchResponse> {
  return pedir<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`)
}
