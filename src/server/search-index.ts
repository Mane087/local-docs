import MiniSearch from 'minisearch'
import type { DocumentCache } from './cache.js'
import type { TreeNode } from './tree.js'

const CONTEXTO = 80
const MAX_FRAGMENTOS = 3

// El contrato de la seccion 6.3 del spec solo admite estos dos estados: el
// indice nace ya en construccion y pasa a listo cuando termina.
export type IndexStatus = 'indexing' | 'ready'

export interface SearchResult {
  path: string
  title: string
  score: number
  fragments: string[]
}

interface Registro {
  id: string
  title: string
  text: string
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function esSubrogadoBajo(codigo: number): boolean {
  return codigo >= 0xdc00 && codigo <= 0xdfff
}

// Si el limite cae justo sobre el subrogado bajo de un par (es decir, entre el
// subrogado alto en `indice - 1` y el bajo en `indice`), lo desplaza un lugar
// hacia el exterior del fragmento para no partir el caracter multibyte.
function ajustarLimite(texto: string, indice: number, haciaAfuera: -1 | 1): number {
  if (indice <= 0 || indice >= texto.length) return indice
  return esSubrogadoBajo(texto.charCodeAt(indice)) ? indice + haciaAfuera : indice
}

function construirFragmentos(texto: string, terminos: string[]): string[] {
  const plano = texto.replace(/\s+/g, ' ').trim()
  const normalizado = normalizar(plano)
  const fragmentos: string[] = []

  for (const termino of terminos) {
    if (fragmentos.length >= MAX_FRAGMENTOS) break
    const posicion = normalizado.indexOf(normalizar(termino))
    if (posicion === -1) continue

    const inicio = ajustarLimite(plano, Math.max(0, posicion - CONTEXTO), -1)
    const fin = ajustarLimite(plano, Math.min(plano.length, posicion + termino.length + CONTEXTO), 1)
    const antes = escaparHtml(plano.slice(inicio, posicion))
    const coincidencia = escaparHtml(plano.slice(posicion, posicion + termino.length))
    const despues = escaparHtml(plano.slice(posicion + termino.length, fin))
    const prefijo = inicio > 0 ? '...' : ''
    const sufijo = fin < plano.length ? '...' : ''
    fragmentos.push(`${prefijo}${antes}<mark>${coincidencia}</mark>${despues}${sufijo}`)
  }

  return fragmentos
}

export function collectDocuments(
  nodes: TreeNode[],
  rootIndex: string | null,
  rootTitle: string | null,
): Array<{ path: string; title: string }> {
  const documentos: Array<{ path: string; title: string }> = []
  if (rootIndex !== null) documentos.push({ path: rootIndex, title: rootTitle ?? rootIndex })

  const recorrer = (lista: TreeNode[]): void => {
    for (const node of lista) {
      if (node.type === 'document') {
        documentos.push({ path: node.path, title: node.title })
        continue
      }
      if (node.indexPath !== null) documentos.push({ path: node.indexPath, title: node.title })
      recorrer(node.children)
    }
  }

  recorrer(nodes)
  return documentos
}

export class SearchIndex {
  private motor = SearchIndex.crearMotor()
  private textos = new Map<string, string>()
  private titulos = new Map<string, string>()
  private estado: IndexStatus = 'indexing'

  constructor(private readonly cache: DocumentCache) {}

  private static crearMotor(): MiniSearch<Registro> {
    return new MiniSearch<Registro>({
      fields: ['title', 'text'],
      storeFields: ['title'],
      idField: 'id',
      processTerm: (termino) => normalizar(termino),
      searchOptions: { prefix: true, boost: { title: 2 } },
    })
  }

  get status(): IndexStatus {
    return this.estado
  }

  async build(documentos: Array<{ path: string; title: string }>): Promise<void> {
    this.estado = 'indexing'
    this.motor = SearchIndex.crearMotor()
    this.textos.clear()
    this.titulos.clear()

    for (const documento of documentos) {
      await this.agregar(documento.path, documento.title)
    }

    this.estado = 'ready'
  }

  async update(path: string, title: string): Promise<void> {
    this.remove(path)
    await this.agregar(path, title)
  }

  remove(path: string): void {
    if (!this.textos.has(path)) return
    this.motor.discard(path)
    this.textos.delete(path)
    this.titulos.delete(path)
  }

  search(query: string, limit = 20): SearchResult[] {
    const consulta = query.trim()
    if (consulta.length === 0) return []

    const terminos = consulta.split(/\s+/)
    return this.motor
      .search(consulta)
      .slice(0, limit)
      .map((resultado) => ({
        path: String(resultado.id),
        title: this.titulos.get(String(resultado.id)) ?? String(resultado.id),
        score: resultado.score,
        fragments: construirFragmentos(this.textos.get(String(resultado.id)) ?? '', terminos),
      }))
  }

  private async agregar(path: string, title: string): Promise<void> {
    try {
      const documento = await this.cache.get(path)
      this.textos.set(path, documento.plainText)
      this.titulos.set(path, title)
      this.motor.add({ id: path, title, text: documento.plainText })
    } catch {
      // Un documento ilegible o inexistente se omite del indice sin interrumpir el resto.
    }
  }
}
