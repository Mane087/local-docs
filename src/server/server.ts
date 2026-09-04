import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveWithinRoot, safeJoin } from './paths.js'
import { DocumentError, type DocumentCache } from './cache.js'
import { collectDocuments, type SearchIndex } from './search-index.js'
import type { TreeProvider } from './tree-provider.js'
import { findFirstDocument, type TreeNode, type TreeResult } from './tree.js'

export interface EventSink {
  addClient(res: http.ServerResponse): void
  closeAll(): void
}

export interface ServerDeps {
  root: string
  cache: DocumentCache
  index: SearchIndex
  tree: TreeProvider
  events: EventSink
  clientDir: string
  /** Interfaz de escucha, contra la que se valida la cabecera Host. */
  host: string
}

// Interfaces que aceptan cualquier nombre: el usuario pidio exponer el
// servidor, asi que no hay una unica autoridad legitima contra la que comparar.
const CUALQUIER_INTERFAZ = new Set(['0.0.0.0', '::', '*'])
// Nombres equivalentes de la maquina local: escuchar en 127.0.0.1 y pedir
// http://localhost:puerto/ es uso legitimo, y al reves tambien.
const NOMBRES_LOCALES = new Set(['localhost', '127.0.0.1', '::1'])

function sinCorchetes(valor: string): string {
  return valor.startsWith('[') && valor.endsWith(']') ? valor.slice(1, -1) : valor
}

/**
 * Defensa contra reenlace de DNS: para el navegador, cualquier dominio que
 * resuelva a la direccion de escucha es del mismo origen y puede leer la API.
 * La cabecera Host si conserva el nombre que se escribio en la barra de
 * direcciones, asi que se compara contra la interfaz de escucha y se rechaza
 * lo que no corresponda.
 */
export function hostPermitido(cabecera: string | undefined, hostEscucha: string): boolean {
  const escucha = sinCorchetes(hostEscucha).toLowerCase()
  if (CUALQUIER_INTERFAZ.has(escucha)) return true
  if (cabecera === undefined || cabecera === '') return false

  let anfitrion: string
  try {
    // Se delega el troceado de host y puerto (incluida la forma [::1]:4180)
    // en el analizador de URL en vez de partir por ':' a mano.
    anfitrion = new URL(`http://${cabecera}`).hostname
  } catch {
    return false
  }

  const nombre = sinCorchetes(anfitrion).toLowerCase()
  if (nombre === '') return false
  if (nombre === escucha) return true
  return NOMBRES_LOCALES.has(escucha) && NOMBRES_LOCALES.has(nombre)
}

const TIPOS_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
}

function responderJson(res: http.ServerResponse, estado: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo)
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(texto)
}

function construirBreadcrumb(nodes: TreeNode[], relPath: string): Array<{ path: string; title: string }> {
  const segmentos = relPath.split('/')
  segmentos.pop()

  const camino: Array<{ path: string; title: string }> = []
  let nivel = nodes
  let acumulado = ''

  for (const segmento of segmentos) {
    acumulado = acumulado === '' ? segmento : `${acumulado}/${segmento}`
    const directorio = nivel.find(
      (node): node is Extract<TreeNode, { type: 'directory' }> =>
        node.type === 'directory' && node.path === acumulado,
    )
    if (!directorio) break
    camino.push({ path: directorio.path, title: directorio.title })
    nivel = directorio.children
  }

  return camino
}

// El titulo de un documento sale de collectDocuments, la misma funcion que
// alimenta el indice de busqueda, para que ambas vistas no puedan discrepar.
// La implementacion anterior recorria por su cuenta nodos e indices de
// directorio y no encontraba el indice de la raiz, que no esta en ninguno de
// los dos, asi que devolvia el nombre del archivo mientras la busqueda si
// mostraba su titulo.
function tituloDeDocumento(resultado: TreeResult, relPath: string, alternativo: string): string {
  const documentos = collectDocuments(resultado.nodes, resultado.rootIndex, resultado.rootTitle)
  return documentos.find((documento) => documento.path === relPath)?.title ?? alternativo
}

async function servirRecurso(res: http.ServerResponse, root: string, relPath: string): Promise<void> {
  // Misma comprobacion de contencion que usan el arbol y la cache: la forma
  // lexica de la ruta no basta, porque fs.readFile sigue los enlaces
  // simbolicos y un enlace dentro de la raiz puede apuntar fuera de ella.
  const resolucion = await resolveWithinRoot(root, relPath)
  if (!resolucion.ok) {
    if (resolucion.reason === 'outside') {
      responderJson(res, 403, { error: 'forbidden' })
    } else {
      responderJson(res, 404, { error: 'not-found' })
    }
    return
  }

  let contenido: Buffer
  try {
    contenido = await fs.readFile(resolucion.path)
  } catch {
    responderJson(res, 404, { error: 'not-found' })
    return
  }

  const tipo = TIPOS_MIME[path.extname(relPath).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': tipo, 'cache-control': 'no-store' })
  res.end(contenido)
}

async function servirCliente(res: http.ServerResponse, clientDir: string, relPath: string): Promise<void> {
  const solicitado = relPath === '' ? 'index.html' : relPath
  const absoluto = safeJoin(clientDir, solicitado)

  if (absoluto !== null && path.extname(absoluto) !== '') {
    try {
      const contenido = await fs.readFile(absoluto)
      const tipo = TIPOS_MIME[path.extname(absoluto).toLowerCase()] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': tipo })
      res.end(contenido)
      return
    } catch {
      // Cae al index.html para que la navegacion del cliente funcione.
    }
  }

  try {
    const indice = await fs.readFile(path.join(clientDir, 'index.html'))
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(indice)
  } catch {
    responderJson(res, 500, { error: 'client-not-built' })
  }
}

export function createServer(deps: ServerDeps): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      responderJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    if (!hostPermitido(req.headers.host, deps.host)) {
      responderJson(res, 403, { error: 'forbidden-host' })
      return
    }

    let url: URL
    let ruta: string
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
      ruta = decodeURIComponent(url.pathname)
    } catch {
      responderJson(res, 400, { error: 'bad-request' })
      return
    }

    try {
      if (ruta === '/api/tree') {
        const resultado = await deps.tree.get()
        responderJson(res, 200, {
          root: deps.root,
          tree: resultado.nodes,
          rootIndex: resultado.rootIndex,
          rootTitle: resultado.rootTitle,
          defaultDoc: resultado.rootIndex ?? findFirstDocument(resultado.nodes),
        })
        return
      }

      if (ruta === '/api/search') {
        const consulta = url.searchParams.get('q') ?? ''
        responderJson(res, 200, {
          status: deps.index.status,
          results: deps.index.status === 'ready' ? deps.index.search(consulta) : [],
        })
        return
      }

      if (ruta === '/api/events') {
        deps.events.addClient(res)
        return
      }

      if (ruta.startsWith('/api/doc/')) {
        const relPath = ruta.slice('/api/doc/'.length)
        const documento = await deps.cache.get(relPath)
        const resultado = await deps.tree.get()
        const { nodes } = resultado
        responderJson(res, 200, {
          path: relPath,
          title: tituloDeDocumento(resultado, relPath, path.basename(relPath)),
          html: documento.html,
          headings: documento.headings,
          frontmatter: documento.frontmatter,
          breadcrumb: construirBreadcrumb(nodes, relPath),
          warnings: documento.warnings,
        })
        return
      }

      if (ruta.startsWith('/assets/')) {
        await servirRecurso(res, deps.root, ruta.slice('/assets/'.length))
        return
      }

      await servirCliente(res, deps.clientDir, ruta.replace(/^\//, ''))
    } catch (error) {
      if (error instanceof DocumentError) {
        const estado = error.code === 'forbidden' ? 403 : error.code === 'not-found' ? 404 : 500
        responderJson(res, estado, { error: error.code })
        return
      }
      responderJson(res, 500, { error: 'internal' })
    }
  })
}
