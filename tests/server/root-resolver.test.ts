import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveDocsRoot } from '../../src/server/root-resolver.js'

const temporales: string[] = []

async function crearProyecto(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-'))
  const real = await fs.realpath(base)
  temporales.push(real)
  return real
}

afterEach(async () => {
  while (temporales.length > 0) {
    const dir = temporales.pop()
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('resolveDocsRoot', () => {
  it('encuentra docs en el directorio actual', async () => {
    const proyecto = await crearProyecto()
    await fs.mkdir(path.join(proyecto, 'docs'))

    const resultado = await resolveDocsRoot({ cwd: proyecto })

    expect(resultado).toEqual({ ok: true, root: path.join(proyecto, 'docs') })
  })

  it('sube por los directorios padre hasta encontrar docs', async () => {
    const proyecto = await crearProyecto()
    await fs.mkdir(path.join(proyecto, 'docs'))
    const anidado = path.join(proyecto, 'src', 'modulo')
    await fs.mkdir(anidado, { recursive: true })

    const resultado = await resolveDocsRoot({ cwd: anidado })

    expect(resultado).toEqual({ ok: true, root: path.join(proyecto, 'docs') })
  })

  it('informa cuando no hay ninguna raiz', async () => {
    const proyecto = await crearProyecto()

    const resultado = await resolveDocsRoot({ cwd: proyecto })

    expect(resultado).toEqual({ ok: false, reason: 'not-found', searchedFrom: proyecto })
  })

  it('usa la ruta de --dir sin buscar hacia arriba', async () => {
    const proyecto = await crearProyecto()
    await fs.mkdir(path.join(proyecto, 'docs'))
    const otro = path.join(proyecto, 'manual')
    await fs.mkdir(otro)

    const resultado = await resolveDocsRoot({ cwd: proyecto, dir: otro })

    expect(resultado).toEqual({ ok: true, root: otro })
  })

  it('informa cuando la ruta de --dir no existe', async () => {
    const proyecto = await crearProyecto()
    const inexistente = path.join(proyecto, 'no-existe')

    const resultado = await resolveDocsRoot({ cwd: proyecto, dir: inexistente })

    expect(resultado).toEqual({
      ok: false,
      reason: 'missing-dir',
      searchedFrom: proyecto,
      requested: inexistente,
    })
  })

  it('informa cuando la ruta de --dir no es un directorio', async () => {
    const proyecto = await crearProyecto()
    const archivo = path.join(proyecto, 'notas.md')
    await fs.writeFile(archivo, '# notas')

    const resultado = await resolveDocsRoot({ cwd: proyecto, dir: archivo })

    expect(resultado).toEqual({
      ok: false,
      reason: 'not-a-directory',
      searchedFrom: proyecto,
      requested: archivo,
    })
  })
})
