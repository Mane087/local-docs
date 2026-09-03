import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTreeProvider } from '../../src/server/tree-provider.js'

const limpiezas: Array<() => Promise<void>> = []

afterEach(async () => {
  while (limpiezas.length > 0) {
    const limpiar = limpiezas.pop()
    if (limpiar) await limpiar()
  }
})

async function crearRaizTemporal(): Promise<string> {
  const raiz = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-tree-provider-')))
  limpiezas.push(async () => {
    await fs.rm(raiz, { recursive: true, force: true })
  })
  return raiz
}

describe('createTreeProvider', () => {
  it('memoiza el resultado correcto: dos llamadas sin invalidate devuelven el mismo objeto', async () => {
    const raiz = await crearRaizTemporal()
    await fs.writeFile(path.join(raiz, 'README.md'), '# Portada')

    const tree = createTreeProvider(raiz)
    const primero = await tree.get()
    const segundo = await tree.get()

    expect(segundo).toBe(primero)
  })

  it('no memoiza un rechazo: tras un fallo de construccion, get() reintenta y puede tener exito', async () => {
    const base = await crearRaizTemporal()
    const raizInexistente = path.join(base, 'docs-luego')

    const tree = createTreeProvider(raizInexistente)

    await expect(tree.get()).rejects.toThrow()

    await fs.mkdir(raizInexistente, { recursive: true })
    await fs.writeFile(path.join(raizInexistente, 'README.md'), '# Portada')

    const resultado = await tree.get()

    expect(resultado.rootIndex).toBe('README.md')
  })
})
