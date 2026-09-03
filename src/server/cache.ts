import fs from 'node:fs/promises'
import path from 'node:path'
import { safeJoin } from './paths.js'
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
    const absoluto = safeJoin(this.root, relPath)
    if (absoluto === null) throw new DocumentError('forbidden')
    if (!EXTENSIONES.has(path.extname(absoluto).toLowerCase())) {
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
