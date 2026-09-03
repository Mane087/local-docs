import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { safeJoin } from './paths.js'
import { DocumentError, type DocumentCache } from './cache.js'
import type { SearchIndex } from './search-index.js'
import type { TreeProvider } from './tree-provider.js'
import { findFirstDocument, type TreeNode } from './tree.js'

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

function tituloDeDocumento(nodes: TreeNode[], relPath: string, alternativo: string): string {
  const buscar = (lista: TreeNode[]): string | null => {
    for (const node of lista) {
      if (node.type === 'document' && node.path === relPath) return node.title
      if (node.type === 'directory') {
        if (node.indexPath === relPath) return node.title
        const encontrado = buscar(node.children)
        if (encontrado !== null) return encontrado
      }
    }
    return null
  }
  return buscar(nodes) ?? alternativo
}

async function servirRecurso(res: http.ServerResponse, root: string, relPath: string): Promise<void> {
  const absoluto = safeJoin(root, relPath)
  if (absoluto === null) {
    responderJson(res, 403, { error: 'forbidden' })
    return
  }

  let contenido: Buffer
  try {
    contenido = await fs.readFile(absoluto)
  } catch {
    responderJson(res, 404, { error: 'not-found' })
    return
  }

  const tipo = TIPOS_MIME[path.extname(absoluto).toLowerCase()] ?? 'application/octet-stream'
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
        const { nodes } = await deps.tree.get()
        responderJson(res, 200, {
          path: relPath,
          title: tituloDeDocumento(nodes, relPath, path.basename(relPath)),
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
