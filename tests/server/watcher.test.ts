import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DocumentCache } from '../../src/server/cache.js'
import { EventHub, type DocsEvent } from '../../src/server/events.js'
import { createRenderer, type Renderer } from '../../src/server/renderer.js'
import { SearchIndex } from '../../src/server/search-index.js'
import { createTreeProvider } from '../../src/server/tree-provider.js'
import { startWatcher } from '../../src/server/watcher.js'

let renderer: Renderer
const limpiezas: Array<() => Promise<void>> = []

beforeAll(async () => {
  renderer = await createRenderer()
})

afterEach(async () => {
  while (limpiezas.length > 0) {
    const limpiar = limpiezas.pop()
    if (limpiar) await limpiar()
  }
})

async function montar(archivos: Record<string, string>) {
  const raiz = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-watcher-')))
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(raiz, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }

  const cache = new DocumentCache(raiz, renderer)
  const tree = createTreeProvider(raiz)
  const index = new SearchIndex(cache)
  const events = new EventHub()
  const emitidos: DocsEvent[] = []
  vi.spyOn(events, 'emit').mockImplementation((evento) => {
    emitidos.push(evento)
  })

  await tree.get()
  const watcher = startWatcher({ root: raiz, cache, index, tree, events, debounceMs: 20 })
  await watcher.ready

  limpiezas.push(async () => {
    await watcher.close()
    await fs.rm(raiz, { recursive: true, force: true })
  })

  return { raiz, cache, tree, emitidos }
}

async function esperarEvento(
  emitidos: DocsEvent[],
  tipo: DocsEvent['type'],
  tiempoLimite = 4000,
): Promise<DocsEvent> {
  const inicio = Date.now()
  for (;;) {
    const encontrado = emitidos.find((evento) => evento.type === tipo)
    if (encontrado) return encontrado
    if (Date.now() - inicio > tiempoLimite) {
      throw new Error(`no llego el evento ${tipo}. Recibidos: ${emitidos.map((e) => e.type).join(', ')}`)
    }
    await new Promise((resolver) => setTimeout(resolver, 25))
  }
}

describe('startWatcher', () => {
  it('emite doc-changed e invalida la cache al modificar un documento', async () => {
    const { raiz, cache, emitidos } = await montar({ 'doc.md': '# Original' })
    await cache.get('doc.md')

    await fs.writeFile(path.join(raiz, 'doc.md'), '# Modificado')

    const evento = await esperarEvento(emitidos, 'doc-changed')
    expect(evento).toEqual({ type: 'doc-changed', path: 'doc.md' })
    expect((await cache.get('doc.md')).html).toContain('Modificado')
  })

  it('emite tree-changed al crear un documento nuevo', async () => {
    const { raiz, tree, emitidos } = await montar({ 'doc.md': '# Doc' })

    await fs.writeFile(path.join(raiz, 'nuevo.md'), '# Nuevo')

    await esperarEvento(emitidos, 'tree-changed')
    const resultado = await tree.get()
    expect(resultado.nodes.map((n) => n.path)).toContain('nuevo.md')
  })

  it('emite doc-removed y tree-changed al borrar un documento', async () => {
    const { raiz, emitidos } = await montar({ 'doc.md': '# Doc', 'otro.md': '# Otro' })

    await fs.rm(path.join(raiz, 'otro.md'))

    const evento = await esperarEvento(emitidos, 'doc-removed')
    expect(evento).toEqual({ type: 'doc-removed', path: 'otro.md' })
    await esperarEvento(emitidos, 'tree-changed')
  })

  it('emite root-unavailable al desaparecer la raiz', async () => {
    const { raiz, emitidos } = await montar({ 'doc.md': '# Doc' })

    await fs.rm(raiz, { recursive: true, force: true })

    await esperarEvento(emitidos, 'root-unavailable')
  })
})
