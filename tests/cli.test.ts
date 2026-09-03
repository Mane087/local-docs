import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatRootError, parseArgs, run } from '../src/cli.js'

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
