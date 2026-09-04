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

interface OpcionesMontar {
  debounceMs?: number
  crearIndex?: (cache: DocumentCache) => SearchIndex
}

async function montar(archivos: Record<string, string>, opciones: OpcionesMontar = {}) {
  const raiz = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-watcher-')))
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(raiz, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }

  const cache = new DocumentCache(raiz, renderer)
  const tree = createTreeProvider(raiz)
  const index = opciones.crearIndex ? opciones.crearIndex(cache) : new SearchIndex(cache)
  const events = new EventHub()
  const emitidos: DocsEvent[] = []
  vi.spyOn(events, 'emit').mockImplementation((evento) => {
    emitidos.push(evento)
  })

  await tree.get()
  const watcher = startWatcher({ root: raiz, cache, index, tree, events, debounceMs: opciones.debounceMs ?? 20 })
  await watcher.ready

  limpiezas.push(async () => {
    await watcher.close()
    await fs.rm(raiz, { recursive: true, force: true })
  })

  return { raiz, cache, tree, index, emitidos, watcher }
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

async function esperarCondicion(condicion: () => boolean, tiempoLimite = 4000): Promise<void> {
  const inicio = Date.now()
  for (;;) {
    if (condicion()) return
    if (Date.now() - inicio > tiempoLimite) {
      throw new Error('la condicion no se cumplio a tiempo')
    }
    await new Promise((resolver) => setTimeout(resolver, 25))
  }
}

// Retrasa solo la PRIMERA llamada a build(). Con eso, si un segundo lote se procesa sin
// esperar a que termine el primero (sin serializacion), su build() se ejecuta y reasigna
// el motor mientras el primero sigue dormido, y al despertar el primero lo vuelve a
// pisar con su propia foto (mas vieja) del arbol: el segundo build se pierde por completo.
// Con la serializacion en su sitio, el segundo build ni siquiera arranca hasta que el
// primero termina del todo, así que nunca compiten por el mismo motor.
// `llamadas` es publico a proposito: el test espera activamente a que el primer build()
// ya haya arrancado (y por tanto ya haya tomado su foto del arbol) antes de provocar el
// segundo cambio, en vez de confiar en un tiempo fijo frente al escaneo real de disco.
class IndiceConRetraso extends SearchIndex {
  llamadas = 0

  constructor(
    cache: DocumentCache,
    private readonly retrasoPrimeraLlamadaMs: number,
  ) {
    super(cache)
  }

  override async build(documentos: Array<{ path: string; title: string }>): Promise<void> {
    const esPrimera = this.llamadas === 0
    this.llamadas += 1
    if (esPrimera) {
      await new Promise((resolver) => setTimeout(resolver, this.retrasoPrimeraLlamadaMs))
    }
    await super.build(documentos)
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

  it('actualiza el titulo real en el indice al editar un documento sin cambio estructural', async () => {
    const { raiz, index } = await montar({ 'doc.md': '---\ntitle: Titulo Original\n---\n# Original' })

    await fs.writeFile(path.join(raiz, 'doc.md'), '---\ntitle: Titulo Original\n---\n# Modificado con novedades')

    await esperarCondicion(() => index.search('novedades').length > 0)
    const [resultado] = index.search('novedades')
    expect(resultado?.path).toBe('doc.md')
    expect(resultado?.title).toBe('Titulo Original')
  })

  it('actualiza el arbol y notifica al cliente cuando una edicion cambia el titulo', async () => {
    const { raiz, tree, emitidos } = await montar({ 'doc.md': '# Titulo Original\n\nContenido.' })
    const invalidarSpy = vi.spyOn(tree, 'invalidate')

    await fs.writeFile(path.join(raiz, 'doc.md'), '# Titulo Nuevo\n\nContenido.')

    await esperarEvento(emitidos, 'tree-changed')
    expect(invalidarSpy).toHaveBeenCalled()
    const resultado = await tree.get()
    const nodo = resultado.nodes.find((n) => n.path === 'doc.md')
    expect(nodo?.title).toBe('Titulo Nuevo')
  })

  it('no reconstruye el arbol completo cuando la edicion no cambia el titulo', async () => {
    const { raiz, tree, index } = await montar({ 'doc.md': '# Titulo Fijo\n\nContenido original.' })
    const invalidarSpy = vi.spyOn(tree, 'invalidate')

    await fs.writeFile(path.join(raiz, 'doc.md'), '# Titulo Fijo\n\nContenido editado con novedades.')

    // Espera a que el camino barato termine de verdad (su ultimo paso es actualizar el
    // indice), en vez de a un tiempo fijo, antes de comprobar que nunca se invalido el
    // arbol.
    await esperarCondicion(() => index.search('novedades').length > 0)

    expect(invalidarSpy).not.toHaveBeenCalled()
  })

  it('mantiene el indice coherente ante rafagas solapadas', async () => {
    let indiceRetrasado: IndiceConRetraso | undefined
    const { raiz, index, emitidos } = await montar(
      { 'doc.md': '# Doc', 'borrar.md': '# Borrar' },
      {
        debounceMs: 15,
        crearIndex: (cache) => {
          indiceRetrasado = new IndiceConRetraso(cache, 300)
          return indiceRetrasado
        },
      },
    )
    if (!indiceRetrasado) throw new Error('crearIndex no se invoco')

    await fs.rm(path.join(raiz, 'borrar.md'))
    // Espera activamente a que el primer lote ya haya entrado a build() (y por tanto ya
    // haya tomado su foto del arbol, sin 'nuevo.md') antes de provocar el segundo lote,
    // mientras el primero sigue dormido dentro del retardo artificial.
    await esperarCondicion(() => indiceRetrasado!.llamadas >= 1)
    await fs.writeFile(path.join(raiz, 'nuevo.md'), '# Nuevo con contenido')

    await esperarCondicion(() => emitidos.filter((evento) => evento.type === 'tree-changed').length >= 2, 6000)

    expect(index.search('doc').map((r) => r.path)).toContain('doc.md')
    expect(index.search('nuevo').map((r) => r.path)).toContain('nuevo.md')
    expect(index.search('borrar').map((r) => r.path)).not.toContain('borrar.md')
  })

  it('close espera el trabajo en curso y no queda nada pendiente que emita eventos', async () => {
    let indiceRetrasado: IndiceConRetraso | undefined
    const { raiz, emitidos, watcher } = await montar(
      { 'doc.md': '# Doc' },
      {
        debounceMs: 15,
        crearIndex: (cache) => {
          indiceRetrasado = new IndiceConRetraso(cache, 150)
          return indiceRetrasado
        },
      },
    )
    if (!indiceRetrasado) throw new Error('crearIndex no se invoco')

    await fs.writeFile(path.join(raiz, 'nuevo.md'), '# Nuevo')
    // Espera activamente a que el procesamiento ya haya entrado a build() (retrasado, en
    // curso) antes de cerrar, para garantizar que close() atrapa trabajo realmente en vuelo.
    await esperarCondicion(() => indiceRetrasado!.llamadas >= 1)

    await watcher.close()

    expect(emitidos.some((evento) => evento.type === 'tree-changed')).toBe(true)
    const cantidadAlCerrar = emitidos.length

    await new Promise((resolver) => setTimeout(resolver, 300))
    expect(emitidos.length).toBe(cantidadAlCerrar)
  })
})
