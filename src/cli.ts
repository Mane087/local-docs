#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { DocumentCache } from './server/cache.js'
import { EventHub } from './server/events.js'
import { findAvailablePort } from './server/port.js'
import { createRenderer } from './server/renderer.js'
import { resolveDocsRoot, type RootResolution } from './server/root-resolver.js'
import { SearchIndex, collectDocuments } from './server/search-index.js'
import { createServer } from './server/server.js'
import { createTreeProvider } from './server/tree-provider.js'
import { startWatcher } from './server/watcher.js'

const PUERTO_POR_OMISION = 4180
const HOST_POR_OMISION = '127.0.0.1'

export interface CliOptions {
  dir?: string
  port: number
  host: string
  open: boolean
  portExplicit: boolean
}

export type ParsedArgs =
  | { kind: 'run'; options: CliOptions }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string }

export const TEXTO_AYUDA = `local-docs [opciones]

  --dir <ruta>    Fuerza la raiz de documentacion y desactiva la busqueda ascendente
  --port <n>      Puerto preferido. Por omision ${PUERTO_POR_OMISION}
  --host <host>   Interfaz de escucha. Por omision ${HOST_POR_OMISION}
  --no-open       No abre el navegador automaticamente
  --version       Muestra la version
  --help          Muestra esta ayuda`

export function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = {
    port: PUERTO_POR_OMISION,
    host: HOST_POR_OMISION,
    open: true,
    portExplicit: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const bruto = argv[i] as string
    const separador = bruto.indexOf('=')
    const nombre = separador === -1 ? bruto : bruto.slice(0, separador)
    const incrustado = separador === -1 ? null : bruto.slice(separador + 1)

    const leerValor = (): string | null => {
      if (incrustado !== null) return incrustado
      const siguiente = argv[i + 1]
      if (siguiente === undefined || siguiente.startsWith('--')) return null
      i += 1
      return siguiente
    }

    switch (nombre) {
      case '--help':
      case '-h':
        return { kind: 'help' }
      case '--version':
      case '-v':
        return { kind: 'version' }
      case '--no-open':
        options.open = false
        break
      case '--dir': {
        const valor = leerValor()
        if (valor === null) return { kind: 'error', message: 'La opcion --dir necesita una ruta' }
        options.dir = valor
        break
      }
      case '--host': {
        const valor = leerValor()
        if (valor === null) return { kind: 'error', message: 'La opcion --host necesita un valor' }
        options.host = valor
        break
      }
      case '--port': {
        const valor = leerValor()
        const numero = Number(valor)
        if (valor === null || !Number.isInteger(numero) || numero < 1 || numero > 65535) {
          return { kind: 'error', message: 'El valor de --port debe ser un numero entre 1 y 65535' }
        }
        options.port = numero
        options.portExplicit = true
        break
      }
      default:
        return { kind: 'error', message: `Opcion desconocida: ${nombre}` }
    }
  }

  return { kind: 'run', options }
}

export function formatRootError(resolution: Extract<RootResolution, { ok: false }>): string {
  switch (resolution.reason) {
    case 'not-found':
      return [
        `No se encontro un directorio docs/ desde ${resolution.searchedFrom} ni en sus directorios padre.`,
        'Ejecuta la herramienta dentro de un proyecto que tenga docs/ en su raiz,',
        'o indica otra carpeta con --dir <ruta>.',
      ].join('\n')
    case 'missing-dir':
      return `La ruta indicada en --dir no existe: ${resolution.requested}`
    case 'not-a-directory':
      return `La ruta indicada en --dir no es un directorio: ${resolution.requested}`
    case 'unreadable':
      return `No se puede leer ${resolution.requested}. Revisa los permisos del directorio.`
  }
}

function abrirNavegador(url: string): void {
  const comando =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  const proceso = spawn(comando, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
  proceso.on('error', () => {})
  proceso.unref()
}

export async function run(
  argv: string[],
  io: { cwd: string; stdout: (linea: string) => void; stderr: (linea: string) => void },
): Promise<number> {
  const parsed = parseArgs(argv)

  if (parsed.kind === 'help') {
    io.stdout(TEXTO_AYUDA)
    return 0
  }
  if (parsed.kind === 'version') {
    io.stdout('0.1.0')
    return 0
  }
  if (parsed.kind === 'error') {
    io.stderr(parsed.message)
    io.stderr(TEXTO_AYUDA)
    return 1
  }

  const { options } = parsed
  const resolucion = await resolveDocsRoot({ cwd: io.cwd, dir: options.dir })
  if (!resolucion.ok) {
    io.stderr(formatRootError(resolucion))
    return 1
  }

  const root = resolucion.root
  const renderer = await createRenderer()
  const cache = new DocumentCache(root, renderer)
  const tree = createTreeProvider(root)
  const index = new SearchIndex(cache)
  const events = new EventHub()
  const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client')

  const servidor = createServer({ root, cache, index, tree, events, clientDir })
  const puerto = await findAvailablePort(options.port, options.host)

  if (puerto !== options.port) {
    const aviso = `El puerto ${options.port} esta ocupado. Se usara el ${puerto}.`
    if (options.portExplicit) io.stderr(aviso)
    else io.stdout(aviso)
  }

  await new Promise<void>((resolver) => servidor.listen(puerto, options.host, resolver))

  const url = `http://${options.host}:${puerto}/`
  io.stdout(`Documentacion servida desde ${root}`)
  io.stdout(`Abierto en ${url}`)

  const resultado = await tree.get()
  void index.build(collectDocuments(resultado.nodes, resultado.rootIndex, resultado.rootTitle))

  const watcher = startWatcher({ root, cache, index, tree, events })

  const cerrar = async (): Promise<void> => {
    events.closeAll()
    await watcher.close()
    servidor.close()
  }
  process.on('SIGINT', () => {
    void cerrar().then(() => process.exit(0))
  })

  if (options.open) abrirNavegador(url)

  return 0
}

const esEjecucionDirecta = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (esEjecucionDirecta) {
  const codigo = await run(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: (linea) => process.stdout.write(`${linea}\n`),
    stderr: (linea) => process.stderr.write(`${linea}\n`),
  })
  if (codigo !== 0) process.exit(codigo)
}
