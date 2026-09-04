import fs from 'node:fs/promises'
import path from 'node:path'
import { constants, type Dirent } from 'node:fs'
import { readHeadMetadata } from './renderer.js'
import { safeJoin } from './paths.js'
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

// Resuelve el destino real de un enlace simbolico y comprueba que quede
// contenido dentro de la raiz. Devuelve null si el enlace esta roto o si su
// destino cae fuera de la raiz (en cuyo caso la entrada se omite).
async function resolverDestinoDeEnlace(rutaAbsoluta: string, raizReal: string): Promise<string | null> {
  let destinoReal: string
  try {
    destinoReal = await fs.realpath(rutaAbsoluta)
  } catch {
    return null
  }
  const relativoAlDestino = path.relative(raizReal, destinoReal)
  return safeJoin(raizReal, relativoAlDestino) === null ? null : destinoReal
}

interface Clasificacion {
  esDirectorio: boolean
  esArchivo: boolean
}

// Determina si una entrada del directorio (archivo, directorio o enlace
// simbolico) debe tratarse como directorio o como archivo. Para un enlace
// simbolico, resuelve y valida su destino con resolverDestinoDeEnlace y usa el
// tipo del destino; se reutiliza tanto para elegir el documento indice de un
// directorio como para el recorrido principal, de modo que un enlace roto o
// fuera de la raiz se descarta de la misma forma en ambos sitios.
async function clasificarEntrada(
  entrada: Dirent,
  rutaAbsoluta: string,
  raizReal: string,
): Promise<Clasificacion | null> {
  if (!entrada.isSymbolicLink()) {
    return { esDirectorio: entrada.isDirectory(), esArchivo: entrada.isFile() }
  }

  const destinoReal = await resolverDestinoDeEnlace(rutaAbsoluta, raizReal)
  if (destinoReal === null) return null // enlace roto o destino fuera de la raiz

  try {
    const estadisticas = await fs.stat(rutaAbsoluta)
    return { esDirectorio: estadisticas.isDirectory(), esArchivo: estadisticas.isFile() }
  } catch {
    return null // el destino desaparecio entre resolverlo y volver a acceder
  }
}

async function construirNivel(
  root: string,
  relativo: string,
  raizReal: string,
  visitados: Set<string>,
): Promise<{
  nodos: TreeNode[]
  indice: string | null
  tituloIndice: string | null
}> {
  const absoluto = path.join(root, relativo)
  const entradas = await fs.readdir(absoluto, { withFileTypes: true })

  // Se clasifica cada entrada una sola vez (siguiendo los enlaces simbolicos
  // que correspondan) para poder elegir el documento indice del directorio
  // -que puede ser un enlace a un markdown- sin repetir la resolucion al
  // procesar esa misma entrada mas abajo, en el recorrido principal.
  const clasificaciones = new Map<string, Clasificacion | null>()
  const nombresDeArchivo: string[] = []
  for (const entrada of entradas) {
    if (esExcluido(entrada.name)) continue
    const rutaRelativa = relativo === '' ? entrada.name : `${relativo}/${entrada.name}`
    const rutaAbsoluta = path.join(root, rutaRelativa)
    const clasificacion = await clasificarEntrada(entrada, rutaAbsoluta, raizReal)
    clasificaciones.set(entrada.name, clasificacion)
    if (clasificacion?.esArchivo) nombresDeArchivo.push(entrada.name)
  }

  const indice = elegirIndice(nombresDeArchivo)
  let tituloIndice: string | null = null

  const pendientes: NodoConOrden[] = []

  for (const entrada of entradas) {
    if (esExcluido(entrada.name)) continue
    const rutaRelativa = relativo === '' ? entrada.name : `${relativo}/${entrada.name}`
    const rutaAbsoluta = path.join(root, rutaRelativa)
    const { prefixOrder } = stripOrderPrefix(entrada.name)

    const clasificacion = clasificaciones.get(entrada.name) ?? null
    if (clasificacion === null) continue // enlace roto o destino fuera de la raiz

    if (clasificacion.esDirectorio) {
      // Se resuelve la ruta real (siga o no un enlace simbolico) para detectar
      // ciclos: un enlace que apunte a un directorio ya visitado (un ancestro,
      // por ejemplo) se omite en vez de recorrerse de nuevo.
      let rutaReal: string
      try {
        rutaReal = await fs.realpath(rutaAbsoluta)
      } catch {
        continue
      }
      if (visitados.has(rutaReal)) continue
      visitados.add(rutaReal)

      const hijo = await construirNivel(root, rutaRelativa, raizReal, visitados)
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

    if (!clasificacion.esArchivo || !esDocumento(entrada.name)) continue

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

// Lee el titulo de un unico documento (frontmatter, si no el primer H1, si no
// el nombre del archivo humanizado) sin renderizar el resto del contenido ni
// recorrer el arbol. Usa la misma logica que construirNivel() para que un
// llamador externo (el observador, al decidir si un cambio de contenido altero
// el titulo) obtenga exactamente el mismo resultado que produciria buildTree().
export async function readDocumentTitle(rutaAbsoluta: string, nombre: string): Promise<string> {
  const metadatos = await metadatosDeDocumento(rutaAbsoluta, nombre)
  return metadatos.title
}

export async function buildTree(root: string): Promise<TreeResult> {
  const raizReal = await fs.realpath(root)
  const visitados = new Set<string>([raizReal])
  const nivel = await construirNivel(root, '', raizReal, visitados)
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
