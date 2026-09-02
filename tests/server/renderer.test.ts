import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRenderer, readHeadMetadata, type Renderer } from '../../src/server/renderer.js'

let renderer: Renderer

beforeAll(async () => {
  renderer = await createRenderer()
})

describe('render', () => {
  it('convierte encabezados y parrafos en html', () => {
    const resultado = renderer.render('# Titulo\n\nUn parrafo.')
    expect(resultado.html).toContain('<h1')
    expect(resultado.html).toContain('Titulo')
    expect(resultado.html).toContain('<p>Un parrafo.</p>')
  })

  it('asigna identificadores a los encabezados y los devuelve en headings', () => {
    const resultado = renderer.render('# Titulo\n\n## Primera seccion\n\n### Detalle')
    expect(resultado.headings).toEqual([
      { level: 1, id: 'titulo', text: 'Titulo' },
      { level: 2, id: 'primera-seccion', text: 'Primera seccion' },
      { level: 3, id: 'detalle', text: 'Detalle' },
    ])
    expect(resultado.html).toContain('id="primera-seccion"')
  })

  it('separa el frontmatter del contenido', () => {
    const resultado = renderer.render('---\ntitle: Instalacion\norder: 2\n---\n\n# Otro titulo')
    expect(resultado.frontmatter).toEqual({ title: 'Instalacion', order: 2 })
    expect(resultado.html).not.toContain('order')
    expect(resultado.firstH1).toBe('Otro titulo')
  })

  it('avisa cuando el frontmatter es invalido sin dejar de renderizar', () => {
    const resultado = renderer.render('---\ntitle: [sin cerrar\n---\n\n# Contenido')
    expect(resultado.warnings).toContain('frontmatter-invalido')
    expect(resultado.frontmatter).toEqual({})
    expect(resultado.html).toContain('Contenido')
  })

  it('resalta los bloques de codigo con lenguaje conocido', () => {
    const resultado = renderer.render('```js\nconst a = 1\n```')
    expect(resultado.html).toContain('<pre')
    expect(resultado.html).toContain('style=')
  })

  it('marca los bloques mermaid para el cliente sin resaltarlos', () => {
    const resultado = renderer.render('```mermaid\ngraph TD;\nA-->B;\n```')
    expect(resultado.html).toContain('class="mermaid"')
    expect(resultado.html).toContain('graph TD;')
  })

  it('extrae texto plano sin marcado para el indice de busqueda', () => {
    const resultado = renderer.render('# Titulo\n\nRequiere **Node** 20.')
    expect(resultado.plainText).toContain('Requiere')
    expect(resultado.plainText).not.toContain('<p>')
  })

  it('anade target y rel a los enlaces externos', () => {
    const resultado = renderer.render('[externo](https://ejemplo.com)')
    expect(resultado.html).toContain('target="_blank"')
    expect(resultado.html).toContain('rel="noopener noreferrer"')
  })
})

describe('readHeadMetadata', () => {
  const temporales: string[] = []

  afterEach(async () => {
    while (temporales.length > 0) {
      const dir = temporales.pop()
      if (dir) await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('lee el frontmatter y el primer h1 sin cargar todo el archivo', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'local-docs-head-'))
    temporales.push(base)
    const archivo = path.join(base, 'doc.md')
    const relleno = 'x'.repeat(20000)
    await fs.writeFile(archivo, `---\ntitle: Desde frontmatter\n---\n\n# Desde h1\n\n${relleno}`)

    const resultado = await readHeadMetadata(archivo)

    expect(resultado.frontmatter).toEqual({ title: 'Desde frontmatter' })
    expect(resultado.firstH1).toBe('Desde h1')
  })
})
