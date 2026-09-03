import fs from 'node:fs/promises'
import path from 'node:path'
import { constants } from 'node:fs'
import { readHeadMetadata } from './renderer.js'
import { compareEntries, humanizeName, stripOrderPrefix, type SortableEntry } from './titles.js'

const EXTENSIONES = new Set(['.md', '.markdown'])
const NOMBRES_INDICE = ['index.md', 'index.markdown', 'README.md', 'readme.md']
const EXCLUIDOS = new Set(['node_modules'])

export interface DocumentNode {
  type: 'document'
  path: string
  title: string
  readable: boolean
}

export interface DirectoryNode {
  type: 'directory'
  path: string
  title: string
  hasIndex: boolean
  indexPath: string | null
  children: TreeNode[]
}

export type TreeNode = DocumentNode | DirectoryNode

export interface TreeResult {
  nodes: TreeNode[]
  rootIndex: string | null
  rootTitle: string | null
}

interface NodoConOrden {
  node: TreeNode
  sortable: SortableEntry
}

function esDocumento(nombre: string): boolean {
  return EXTENSIONES.has(path.extname(nombre).toLowerCase())
}

function esExcluido(nombre: string): boolean {
  return nombre.startsWith('.') || EXCLUIDOS.has(nombre)
}

async function esLegible(rutaAbsoluta: string): Promise<boolean> {
  try {
    await fs.access(rutaAbsoluta, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function ordenDeFrontmatter(frontmatter: Record<string, unknown>): number | null {
  const valor = frontmatter.order
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function tituloDeFrontmatter(frontmatter: Record<string, unknown>): string | null {
  const valor = frontmatter.title
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null
}

async function metadatosDeDocumento(rutaAbsoluta: string, nombre: string): Promise<{
  title: string
  order: number | null
  readable: boolean
}> {
  const readable = await esLegible(rutaAbsoluta)
  if (!readable) {
    return { title: humanizeName(nombre), order: null, readable: false }
  }
  try {
    const { frontmatter, firstH1 } = await readHeadMetadata(rutaAbsoluta)
    const title = tituloDeFrontmatter(frontmatter) ?? firstH1 ?? humanizeName(nombre)
    return { title, order: ordenDeFrontmatter(frontmatter), readable: true }
  } catch {
    return { title: humanizeName(nombre), order: null, readable: false }
  }
}

function elegirIndice(nombres: string[]): string | null {
  for (const candidato of NOMBRES_INDICE) {
    const encontrado = nombres.find((nombre) => nombre === candidato)
    if (encontrado) return encontrado
  }
  return null
}

async function construirNivel(root: string, relativo: string): Promise<{
  nodos: TreeNode[]
  indice: string | null
  tituloIndice: string | null
}> {
  const absoluto = path.join(root, relativo)
  const entradas = await fs.readdir(absoluto, { withFileTypes: true })

  const nombresDeArchivo = entradas.filter((e) => e.isFile() && !esExcluido(e.name)).map((e) => e.name)
  const indice = elegirIndice(nombresDeArchivo)
  let tituloIndice: string | null = null

  const pendientes: NodoConOrden[] = []

  for (const entrada of entradas) {
    if (esExcluido(entrada.name)) continue
    const rutaRelativa = relativo === '' ? entrada.name : `${relativo}/${entrada.name}`
    const rutaAbsoluta = path.join(root, rutaRelativa)
    const { prefixOrder } = stripOrderPrefix(entrada.name)

    if (entrada.isDirectory()) {
      const hijo = await construirNivel(root, rutaRelativa)
      if (hijo.nodos.length === 0 && hijo.indice === null) continue
      const indicePath = hijo.indice === null ? null : `${rutaRelativa}/${hijo.indice}`
      pendientes.push({
        node: {
          type: 'directory',
          path: rutaRelativa,
          title: hijo.tituloIndice ?? humanizeName(entrada.name),
          hasIndex: indicePath !== null,
          indexPath: indicePath,
          children: hijo.nodos,
        },
        sortable: { type: 'directory', order: null, prefixOrder, name: entrada.name },
      })
      continue
    }

    if (!entrada.isFile() || !esDocumento(entrada.name)) continue

    const metadatos = await metadatosDeDocumento(rutaAbsoluta, entrada.name)

    if (entrada.name === indice) {
      tituloIndice = metadatos.title
      continue
    }

    pendientes.push({
      node: {
        type: 'document',
        path: rutaRelativa,
        title: metadatos.title,
        readable: metadatos.readable,
      },
      sortable: { type: 'document', order: metadatos.order, prefixOrder, name: entrada.name },
    })
  }

  pendientes.sort((a, b) => compareEntries(a.sortable, b.sortable))
  return { nodos: pendientes.map((p) => p.node), indice, tituloIndice }
}

export async function buildTree(root: string): Promise<TreeResult> {
  const nivel = await construirNivel(root, '')
  return { nodes: nivel.nodos, rootIndex: nivel.indice, rootTitle: nivel.tituloIndice }
}

export function findFirstDocument(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'document') return node.path
    if (node.indexPath !== null) return node.indexPath
    const anidado = findFirstDocument(node.children)
    if (anidado !== null) return anidado
  }
  return null
}

export function findDocument(nodes: TreeNode[], target: string): DocumentNode | null {
  for (const node of nodes) {
    if (node.type === 'document') {
      if (node.path === target) return node
      continue
    }
    const encontrado = findDocument(node.children, target)
    if (encontrado !== null) return encontrado
  }
  return null
}
