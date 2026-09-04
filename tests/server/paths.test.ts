import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveWithinRoot, safeJoin, toRelative } from '../../src/server/paths.js'

const root = path.resolve('/proyecto/docs')

describe('safeJoin', () => {
  it('resuelve una ruta relativa dentro de la raiz', () => {
    expect(safeJoin(root, 'guia/inicio.md')).toBe(path.join(root, 'guia', 'inicio.md'))
  })

  it('acepta la raiz misma con cadena vacia', () => {
    expect(safeJoin(root, '')).toBe(root)
  })

  it('rechaza rutas que salen de la raiz', () => {
    expect(safeJoin(root, '../secreto.md')).toBeNull()
    expect(safeJoin(root, 'guia/../../secreto.md')).toBeNull()
  })

  it('rechaza rutas absolutas', () => {
    expect(safeJoin(root, '/etc/passwd')).toBeNull()
  })

  it('rechaza rutas con bytes nulos', () => {
    expect(safeJoin(root, 'guia\0.md')).toBeNull()
  })
})

describe('toRelative', () => {
  it('devuelve una ruta relativa con separador posix', () => {
    const absolute = path.join(root, 'guia', 'inicio.md')
    expect(toRelative(root, absolute)).toBe('guia/inicio.md')
  })
})

describe('resolveWithinRoot', () => {
  const temporales: string[] = []

  afterEach(async () => {
    while (temporales.length > 0) {
      const dir = temporales.pop()
      if (dir) await fs.rm(dir, { recursive: true, force: true })
    }
  })

  async function crearDirectorio(prefijo: string): Promise<string> {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefijo)))
    temporales.push(dir)
    return dir
  }

  it('resuelve un archivo real dentro de la raiz', async () => {
    const raiz = await crearDirectorio('local-docs-paths-')
    await fs.writeFile(path.join(raiz, 'doc.md'), '# Doc')

    expect(await resolveWithinRoot(raiz, 'doc.md')).toEqual({ ok: true, path: path.join(raiz, 'doc.md') })
  })

  it('rechaza un enlace simbolico cuyo destino cae fuera de la raiz', async () => {
    const raiz = await crearDirectorio('local-docs-paths-')
    const fuera = await crearDirectorio('local-docs-paths-fuera-')
    await fs.writeFile(path.join(fuera, 'secreto.md'), '# Privado')
    await fs.symlink(path.join(fuera, 'secreto.md'), path.join(raiz, 'escape.md'))

    expect(await resolveWithinRoot(raiz, 'escape.md')).toEqual({ ok: false, reason: 'outside' })
  })

  it('acepta un enlace simbolico cuyo destino sigue dentro de la raiz', async () => {
    const raiz = await crearDirectorio('local-docs-paths-')
    await fs.writeFile(path.join(raiz, 'real.md'), '# Real')
    await fs.symlink(path.join(raiz, 'real.md'), path.join(raiz, 'alias.md'))

    expect(await resolveWithinRoot(raiz, 'alias.md')).toEqual({ ok: true, path: path.join(raiz, 'real.md') })
  })

  it('distingue una ruta inexistente de una ruta fuera de la raiz', async () => {
    const raiz = await crearDirectorio('local-docs-paths-')

    expect(await resolveWithinRoot(raiz, 'no-existe.md')).toEqual({ ok: false, reason: 'missing' })
    expect(await resolveWithinRoot(raiz, '../fuera.md')).toEqual({ ok: false, reason: 'outside' })
  })
})
