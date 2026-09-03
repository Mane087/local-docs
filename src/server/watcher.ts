import fs from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'
import type { DocumentCache } from './cache.js'
import type { EventHub } from './events.js'
import { collectDocuments, type SearchIndex } from './search-index.js'
import type { TreeProvider } from './tree-provider.js'
import { toRelative } from './paths.js'

const EXTENSIONES = new Set(['.md', '.markdown'])

export interface WatcherDeps {
  root: string
  cache: DocumentCache
  index: SearchIndex
  tree: TreeProvider
  events: EventHub
  debounceMs?: number
}

interface Cambio {
  tipo: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  relPath: string
}

export function startWatcher(deps: WatcherDeps): { close(): Promise<void>; ready: Promise<void> } {
  const debounceMs = deps.debounceMs ?? 120
  const pendientes: Cambio[] = []
  let temporizador: NodeJS.Timeout | null = null
  let raizDisponible = true
  let listo = false

  const programar = (): void => {
    if (temporizador !== null) clearTimeout(temporizador)
    temporizador = setTimeout(() => {
      temporizador = null
      void procesar(pendientes.splice(0, pendientes.length))
    }, debounceMs)
  }

  const procesar = async (cambios: Cambio[]): Promise<void> => {
    if (cambios.length === 0) return

    const estructuraAfectada = cambios.some((cambio) => cambio.tipo !== 'change')

    for (const cambio of cambios) {
      if (!EXTENSIONES.has(path.extname(cambio.relPath).toLowerCase())) continue

      if (cambio.tipo === 'unlink') {
        deps.cache.invalidate(cambio.relPath)
        deps.index.remove(cambio.relPath)
        deps.events.emit({ type: 'doc-removed', path: cambio.relPath })
        continue
      }

      if (cambio.tipo === 'change' || cambio.tipo === 'add') {
        deps.cache.invalidate(cambio.relPath)
        deps.events.emit({ type: 'doc-changed', path: cambio.relPath })
      }
    }

    if (!estructuraAfectada) {
      for (const cambio of cambios) {
        if (EXTENSIONES.has(path.extname(cambio.relPath).toLowerCase())) {
          await deps.index.update(cambio.relPath, cambio.relPath)
        }
      }
      return
    }

    deps.tree.invalidate()

    try {
      await fs.access(deps.root)
    } catch {
      if (raizDisponible) {
        raizDisponible = false
        deps.events.emit({ type: 'root-unavailable' })
      }
      return
    }

    if (!raizDisponible) {
      raizDisponible = true
      deps.events.emit({ type: 'root-restored' })
    }

    const resultado = await deps.tree.get()
    await deps.index.build(collectDocuments(resultado.nodes, resultado.rootIndex, resultado.rootTitle))
    deps.events.emit({ type: 'tree-changed' })
  }

  const observador = chokidar.watch(deps.root, {
    ignored: (ruta: string) => path.basename(ruta).startsWith('.') || path.basename(ruta) === 'node_modules',
    ignoreInitial: true,
    persistent: true,
  })

  // Los eventos del escaneo inicial de chokidar (antes de 'ready') se descartan: durante
  // ese escaneo un archivo creado o borrado por el propio llamador puede quedar mal
  // clasificado (un alta reportada como 'change') o perderse por completo (un borrado del
  // que chokidar nunca llega a enterarse). A partir de 'ready' el observador es fiable.
  for (const tipo of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
    observador.on(tipo, (rutaAbsoluta: string) => {
      if (!listo) return
      pendientes.push({ tipo, relPath: toRelative(deps.root, rutaAbsoluta) })
      programar()
    })
  }

  observador.on('unlinkDir', (rutaAbsoluta: string) => {
    if (!listo) return
    if (path.resolve(rutaAbsoluta) === path.resolve(deps.root)) {
      pendientes.push({ tipo: 'unlinkDir', relPath: '' })
      programar()
    }
  })

  const listoPromise = new Promise<void>((resolve) => {
    observador.once('ready', () => {
      listo = true
      resolve()
    })
  })

  return {
    ready: listoPromise,
    async close(): Promise<void> {
      if (temporizador !== null) clearTimeout(temporizador)
      await observador.close()
    },
  }
}
