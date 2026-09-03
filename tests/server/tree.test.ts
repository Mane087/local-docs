import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildTree, findDocument, findFirstDocument, type DirectoryNode } from '../../src/server/tree.js'

const temporales: string[] = []

async function crearRaiz(archivos: Record<string, string>): Promise<string> {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-tree-')))
  temporales.push(base)
  for (const [relativo, contenido] of Object.entries(archivos)) {
    const destino = path.join(base, relativo)
    await fs.mkdir(path.dirname(destino), { recursive: true })
    await fs.writeFile(destino, contenido)
  }
  return base
}

afterEach(async () => {
  while (temporales.length > 0) {
    const dir = temporales.pop()
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('buildTree', () => {
  it('lista documentos markdown con rutas relativas posix', async () => {
    const raiz = await crearRaiz({ 'inicio.md': '# Inicio', 'guia/uso.md': '# Uso' })

    const { nodes } = await buildTree(raiz)

    expect(nodes).toEqual([
      {
        type: 'directory',
        path: 'guia',
        title: 'Guia',
        hasIndex: false,
        indexPath: null,
        children: [{ type: 'document', path: 'guia/uso.md', title: 'Uso', readable: true }],
      },
      { type: 'document', path: 'inicio.md', title: 'Inicio', readable: true },
    ])
  })

  it('ignora archivos ocultos, node_modules y extensiones no markdown', async () => {
    const raiz = await crearRaiz({
      'visible.md': '# Visible',
      '.oculto.md': '# Oculto',
      '.git/config.md': 'x',
      'node_modules/paquete/readme.md': 'x',
      'imagen.png': 'x',
    })

    const { nodes } = await buildTree(raiz)

    expect(nodes.map((n) => n.path)).toEqual(['visible.md'])
  })

  it('toma el titulo del frontmatter antes que del primer h1', async () => {
    const raiz = await crearRaiz({ 'doc.md': '---\ntitle: Desde frontmatter\n---\n\n# Desde h1' })

    const { nodes } = await buildTree(raiz)

    expect(nodes[0]?.title).toBe('Desde frontmatter')
  })

  it('toma el titulo del primer h1 antes que del nombre de archivo', async () => {
    const raiz = await crearRaiz({ 'mi-doc.md': '# Titulo real' })

    const { nodes } = await buildTree(raiz)

    expect(nodes[0]?.title).toBe('Titulo real')
  })

  it('usa el nombre normalizado cuando no hay frontmatter ni h1', async () => {
    const raiz = await crearRaiz({ '01-guia-de-inicio.md': 'Solo texto.' })

    const { nodes } = await buildTree(raiz)

    expect(nodes[0]?.title).toBe('Guia de inicio')
  })

  it('ordena por order del frontmatter, luego por prefijo y luego alfabeticamente', async () => {
    const raiz = await crearRaiz({
      'zeta.md': '---\norder: 1\n---\n',
      '02-medio.md': 'x',
      'alfa.md': 'x',
      '01-primero.md': 'x',
    })

    const { nodes } = await buildTree(raiz)

    expect(nodes.map((n) => n.path)).toEqual(['01-primero.md', 'zeta.md', '02-medio.md', 'alfa.md'])
  })

  it('convierte index.md en el documento del directorio y lo excluye de los hijos', async () => {
    const raiz = await crearRaiz({
      'guia/index.md': '# Guia completa',
      'guia/uso.md': '# Uso',
    })

    const { nodes } = await buildTree(raiz)
    const directorio = nodes[0] as DirectoryNode

    expect(directorio.hasIndex).toBe(true)
    expect(directorio.indexPath).toBe('guia/index.md')
    expect(directorio.title).toBe('Guia completa')
    expect(directorio.children.map((n) => n.path)).toEqual(['guia/uso.md'])
  })

  it('prefiere index.md sobre README.md', async () => {
    const raiz = await crearRaiz({
      'guia/index.md': '# Desde index',
      'guia/README.md': '# Desde readme',
      'guia/uso.md': '# Uso',
    })

    const { nodes } = await buildTree(raiz)
    const directorio = nodes[0] as DirectoryNode

    expect(directorio.indexPath).toBe('guia/index.md')
    expect(directorio.children.map((n) => n.path)).toEqual(['guia/README.md', 'guia/uso.md'])
  })

  it('devuelve el indice de la raiz por separado y no lo incluye en los nodos', async () => {
    const raiz = await crearRaiz({ 'README.md': '# Portada', 'otro.md': '# Otro' })

    const { nodes, rootIndex, rootTitle } = await buildTree(raiz)

    expect(rootIndex).toBe('README.md')
    expect(rootTitle).toBe('Portada')
    expect(nodes.map((n) => n.path)).toEqual(['otro.md'])
  })

  it('devuelve un arbol vacio cuando la raiz no tiene documentos', async () => {
    const raiz = await crearRaiz({ 'imagen.png': 'x' })

    const resultado = await buildTree(raiz)

    expect(resultado).toEqual({ nodes: [], rootIndex: null, rootTitle: null })
  })
})

describe('enlaces simbolicos', () => {
  it('sigue un enlace simbolico a un documento markdown dentro de la raiz', async () => {
    const raiz = await crearRaiz({ 'objetivo.md': '# Objetivo real' })
    await fs.symlink(path.join(raiz, 'objetivo.md'), path.join(raiz, 'atajo.md'), 'file')

    const { nodes } = await buildTree(raiz)

    expect(nodes.find((n) => n.path === 'atajo.md')).toEqual({
      type: 'document',
      path: 'atajo.md',
      title: 'Objetivo real',
      readable: true,
    })
  })

  it('sigue un enlace simbolico a un directorio dentro de la raiz', async () => {
    const raiz = await crearRaiz({ 'real/uso.md': '# Uso real' })
    await fs.symlink(path.join(raiz, 'real'), path.join(raiz, 'atajo'), 'dir')

    const { nodes } = await buildTree(raiz)
    const enlace = nodes.find((n) => n.path === 'atajo') as DirectoryNode

    expect(enlace.type).toBe('directory')
    expect(enlace.children.map((n) => n.path)).toEqual(['atajo/uso.md'])
  })

  it('omite un enlace simbolico cuyo destino queda fuera de la raiz', async () => {
    const fuera = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-fuera-')))
    temporales.push(fuera)
    await fs.writeFile(path.join(fuera, 'externo.md'), '# Externo')
    const raiz = await crearRaiz({ 'inicio.md': '# Inicio' })
    await fs.symlink(path.join(fuera, 'externo.md'), path.join(raiz, 'enlace-externo.md'), 'file')

    const { nodes } = await buildTree(raiz)

    expect(nodes.map((n) => n.path)).toEqual(['inicio.md'])
  })

  it('omite un enlace simbolico roto sin romper la construccion del arbol', async () => {
    const raiz = await crearRaiz({ 'inicio.md': '# Inicio' })
    await fs.symlink(path.join(raiz, 'no-existe.md'), path.join(raiz, 'roto.md'), 'file')

    const { nodes } = await buildTree(raiz)

    expect(nodes.map((n) => n.path)).toEqual(['inicio.md'])
  })

  it('no entra en recursion infinita si un enlace simbolico apunta a un directorio ancestro', async () => {
    const raiz = await crearRaiz({ 'a/b/doc.md': '# Doc' })
    await fs.symlink(path.join(raiz, 'a'), path.join(raiz, 'a', 'b', 'vuelta'), 'dir')

    const { nodes } = await buildTree(raiz)
    const a = nodes.find((n) => n.path === 'a') as DirectoryNode
    const b = a.children.find((n) => n.path === 'a/b') as DirectoryNode

    expect(b.children.map((n) => n.path)).toEqual(['a/b/doc.md'])
  })

  it('usa un enlace simbolico llamado index.md como documento indice del directorio', async () => {
    const raiz = await crearRaiz({ 'guia/objetivo.md': '# Objetivo real', 'guia/uso.md': '# Uso' })
    await fs.symlink(path.join(raiz, 'guia', 'objetivo.md'), path.join(raiz, 'guia', 'index.md'), 'file')

    const { nodes } = await buildTree(raiz)
    const directorio = nodes.find((n) => n.path === 'guia') as DirectoryNode

    expect(directorio.hasIndex).toBe(true)
    expect(directorio.indexPath).toBe('guia/index.md')
    expect(directorio.title).toBe('Objetivo real')
    expect(directorio.children.map((n) => n.path)).toEqual(['guia/objetivo.md', 'guia/uso.md'])
  })
})

describe('findFirstDocument', () => {
  it('devuelve el primer documento en el orden del arbol', async () => {
    const raiz = await crearRaiz({ 'guia/uso.md': '# Uso', 'zeta.md': '# Zeta' })

    const { nodes } = await buildTree(raiz)

    expect(findFirstDocument(nodes)).toBe('guia/uso.md')
  })

  it('devuelve el indice de un directorio si no tiene hijos documentales', async () => {
    const raiz = await crearRaiz({ 'guia/index.md': '# Guia' })

    const { nodes } = await buildTree(raiz)

    expect(findFirstDocument(nodes)).toBe('guia/index.md')
  })
})

describe('findDocument', () => {
  it('localiza un documento anidado por su ruta', async () => {
    const raiz = await crearRaiz({ 'guia/uso.md': '# Uso' })

    const { nodes } = await buildTree(raiz)

    expect(findDocument(nodes, 'guia/uso.md')?.title).toBe('Uso')
    expect(findDocument(nodes, 'guia/inexistente.md')).toBeNull()
  })
})
