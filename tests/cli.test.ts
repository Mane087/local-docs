import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { esEntradaDirecta, escucharServidor, formatRootError, parseArgs, run } from '../src/cli.js'

describe('parseArgs', () => {
  it('usa los valores por omision', () => {
    expect(parseArgs([])).toEqual({
      kind: 'run',
      options: { port: 4180, host: '127.0.0.1', open: true, portExplicit: false },
    })
  })

  it('lee --dir, --port y --host', () => {
    expect(parseArgs(['--dir', 'manual', '--port', '5000', '--host', '0.0.0.0'])).toEqual({
      kind: 'run',
      options: { dir: 'manual', port: 5000, host: '0.0.0.0', open: true, portExplicit: true },
    })
  })

  it('acepta la forma --port=5000', () => {
    const resultado = parseArgs(['--port=5000'])
    expect(resultado).toMatchObject({ kind: 'run', options: { port: 5000 } })
  })

  it('desactiva la apertura del navegador con --no-open', () => {
    expect(parseArgs(['--no-open'])).toMatchObject({ options: { open: false } })
  })

  it('reconoce --help y --version', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' })
    expect(parseArgs(['--version'])).toEqual({ kind: 'version' })
  })

  it('rechaza un puerto invalido', () => {
    expect(parseArgs(['--port', 'abc'])).toEqual({
      kind: 'error',
      message: 'El valor de --port debe ser un numero entre 1 y 65535',
    })
  })

  it('rechaza una opcion desconocida', () => {
    expect(parseArgs(['--turbo'])).toEqual({ kind: 'error', message: 'Opcion desconocida: --turbo' })
  })

  it('rechaza --dir sin valor', () => {
    expect(parseArgs(['--dir'])).toEqual({ kind: 'error', message: 'La opcion --dir necesita una ruta' })
  })
})

describe('run --version', () => {
  it('imprime exactamente la version declarada en package.json', async () => {
    const rutaPkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json')
    const pkg = JSON.parse(await fs.readFile(rutaPkg, 'utf8')) as { version: string }

    const salidas: string[] = []
    const codigo = await run(['--version'], {
      cwd: process.cwd(),
      stdout: (linea) => salidas.push(linea),
      stderr: () => {},
    })

    expect(codigo).toBe(0)
    expect(salidas).toEqual([pkg.version])
  })
})

describe('run() y fallos de arranque', () => {
  it('informa por stderr y devuelve un codigo distinto de cero cuando no hay puerto libre en el rango probado', async () => {
    const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-cli-'))
    await fs.writeFile(path.join(raiz, 'index.md'), '# Inicio')

    // Ocupa el ultimo puerto valido (65535). El siguiente candidato que probaria
    // findAvailablePort, 65536, esta fuera del rango valido y provoca que su
    // busqueda falle sin necesidad de abrir los otros ~18 sockets restantes.
    const ocupante = net.createServer()
    await new Promise<void>((resolver) => ocupante.listen(65535, '127.0.0.1', resolver))

    try {
      const errores: string[] = []
      const codigo = await run(['--dir', raiz, '--port', '65535', '--no-open'], {
        cwd: process.cwd(),
        stdout: () => {},
        stderr: (linea) => errores.push(linea),
      })

      expect(codigo).not.toBe(0)
      expect(errores.length).toBeGreaterThan(0)
      expect(errores.some((linea) => linea.includes('--port'))).toBe(true)
    } finally {
      await new Promise<void>((resolver) => ocupante.close(() => resolver()))
      await fs.rm(raiz, { recursive: true, force: true })
    }
  })
})

describe('escucharServidor', () => {
  it('rechaza de forma controlada en vez de dejar que el error tumbe el proceso', async () => {
    // Ocupa un puerto real y le pide al servidor que escuche exactamente ahi:
    // reproduce de forma determinista el fallo de escucha (EADDRINUSE) que
    // dispara el evento 'error' de http.Server, sin depender de una carrera
    // entre la comprobacion de findAvailablePort y el listen real.
    const ocupante = net.createServer()
    await new Promise<void>((resolver) => ocupante.listen(0, '127.0.0.1', resolver))
    const puerto = (ocupante.address() as net.AddressInfo).port
    const servidor = http.createServer()

    try {
      await expect(escucharServidor(servidor, puerto, '127.0.0.1')).rejects.toThrow()
    } finally {
      await new Promise<void>((resolver) => ocupante.close(() => resolver()))
    }
  })
})

describe('formatRootError', () => {
  it('explica que no se encontro docs y propone --dir', () => {
    const mensaje = formatRootError({ ok: false, reason: 'not-found', searchedFrom: '/proyecto' })

    expect(mensaje).toContain('/proyecto')
    expect(mensaje).toContain('--dir')
  })

  it('explica que la ruta indicada no existe', () => {
    const mensaje = formatRootError({
      ok: false,
      reason: 'missing-dir',
      searchedFrom: '/proyecto',
      requested: '/proyecto/manual',
    })

    expect(mensaje).toContain('/proyecto/manual')
    expect(mensaje).toContain('no existe')
  })

  it('explica que la ruta indicada no es un directorio', () => {
    const mensaje = formatRootError({
      ok: false,
      reason: 'not-a-directory',
      searchedFrom: '/proyecto',
      requested: '/proyecto/notas.md',
    })

    expect(mensaje).toContain('no es un directorio')
  })

  it('explica que la ruta no se puede leer', () => {
    const mensaje = formatRootError({
      ok: false,
      reason: 'unreadable',
      searchedFrom: '/proyecto',
      requested: '/proyecto/docs',
    })

    expect(mensaje).toContain('permisos')
  })
})

describe('cierre limpio', () => {
  it('registra el cierre para la senal de interrupcion y para la de terminacion', async () => {
    const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-senales-'))
    const manejadores = new Map<string, () => void>()
    const registrarOriginal = process.on.bind(process)
    const espiaOn = vi.spyOn(process, 'on').mockImplementation(((senal: string, manejador: () => void) => {
      if (senal === 'SIGINT' || senal === 'SIGTERM') {
        manejadores.set(senal, manejador)
        return process
      }
      return registrarOriginal(senal as NodeJS.Signals, manejador)
    }) as typeof process.on)
    const espiaExit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    try {
      const codigo = await run(['--dir', raiz, '--no-open'], {
        cwd: raiz,
        stdout: () => {},
        stderr: () => {},
      })

      expect(codigo).toBe(0)
      // Un gestor de procesos o un `kill` normal envian SIGTERM, no SIGINT:
      // sin este manejador el proceso moria sin cerrar el observador ni los
      // clientes SSE.
      expect([...manejadores.keys()]).toEqual(['SIGINT', 'SIGTERM'])

      // Se dispara la senal de terminacion para comprobar que hace el cierre
      // completo (y de paso deja el puerto libre al terminar el test).
      manejadores.get('SIGTERM')?.()
      await vi.waitFor(() => expect(espiaExit).toHaveBeenCalledWith(0))
    } finally {
      espiaOn.mockRestore()
      espiaExit.mockRestore()
      await fs.rm(raiz, { recursive: true, force: true })
    }
  })
})

describe('esEntradaDirecta', () => {
  it('reconoce la ejecucion a traves de un enlace simbolico como la de npm', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-bin-')))
    const archivo = path.join(base, 'cli.js')
    const enlace = path.join(base, 'local-docs')
    await fs.writeFile(archivo, '')
    await fs.symlink(archivo, enlace)

    try {
      expect(esEntradaDirecta(enlace, pathToFileURL(archivo).href)).toBe(true)
      expect(esEntradaDirecta(archivo, pathToFileURL(archivo).href)).toBe(true)
    } finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })

  it('no confunde otro archivo con el modulo', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-bin-')))
    const archivo = path.join(base, 'cli.js')
    const otro = path.join(base, 'otro.js')
    await fs.writeFile(archivo, '')
    await fs.writeFile(otro, '')

    try {
      expect(esEntradaDirecta(otro, pathToFileURL(archivo).href)).toBe(false)
      expect(esEntradaDirecta(undefined, pathToFileURL(archivo).href)).toBe(false)
    } finally {
      await fs.rm(base, { recursive: true, force: true })
    }
  })
})
