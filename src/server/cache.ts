import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveWithinRoot } from './paths.js'
import type { RenderedDocument, Renderer } from './renderer.js'

const EXTENSIONES = new Set(['.md', '.markdown'])

export type DocumentErrorCode = 'not-found' | 'forbidden' | 'unreadable'

export class DocumentError extends Error {
  constructor(public readonly code: DocumentErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'DocumentError'
  }
}

export interface CachedDocument extends RenderedDocument {
  mtimeMs: number
  size: number
}

export class DocumentCache {
  private readonly entradas = new Map<string, CachedDocument>()

  constructor(
    private readonly root: string,
    private readonly renderer: Renderer,
  ) {}

  has(relPath: string): boolean {
    return this.entradas.has(relPath)
  }

  invalidate(relPath: string): void {
    this.entradas.delete(relPath)
  }

  clear(): void {
    this.entradas.clear()
  }

  async get(relPath: string): Promise<CachedDocument> {
    // La contencion se comprueba sobre la ruta real (resolveWithinRoot sigue
    // los enlaces simbolicos), no solo sobre la forma lexica de relPath: de lo
    // contrario un enlace dentro de la raiz que apunte fuera se leeria igual,
    // porque fs.readFile si sigue el enlace.
    const resolucion = await resolveWithinRoot(this.root, relPath)
    if (!resolucion.ok) {
      if (resolucion.reason === 'outside') throw new DocumentError('forbidden')
      this.entradas.delete(relPath)
      throw new DocumentError('not-found')
    }
    const absoluto = resolucion.path

    // La extension se comprueba sobre la ruta pedida y no sobre el destino
    // real: lo que decide si esto es un documento es la ruta que se sirve.
    if (!EXTENSIONES.has(path.extname(relPath).toLowerCase())) {
      throw new DocumentError('not-found')
    }

    let info
    try {
      info = await fs.stat(absoluto)
    } catch {
      this.entradas.delete(relPath)
      throw new DocumentError('not-found')
    }
    if (!info.isFile()) throw new DocumentError('not-found')

    const existente = this.entradas.get(relPath)
    if (existente && existente.mtimeMs === info.mtimeMs && existente.size === info.size) return existente

    let source: string
    try {
      source = await fs.readFile(absoluto, 'utf8')
    } catch {
      throw new DocumentError('unreadable')
    }

    const documento: CachedDocument = { ...this.renderer.render(source), mtimeMs: info.mtimeMs, size: info.size }
    this.entradas.set(relPath, documento)
    return documento
  }
}
