import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) as {
  description?: string
  author?: string
  directories?: unknown
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('metadatos del paquete', () => {
  // La herramienta se usa con `npx`, que descarga las dependencias de
  // ejecucion en cada invocacion. mermaid solo lo necesita el cliente, que ya
  // lo lleva empaquetado en dist/, asi que como dependencia de ejecucion se
  // descargaba una segunda copia sin usarla.
  it('mermaid no es una dependencia de ejecucion', () => {
    expect(pkg.dependencies).not.toHaveProperty('mermaid')
    expect(pkg.devDependencies).toHaveProperty('mermaid')
  })

  it('ningun modulo del servidor importa mermaid', () => {
    const modulos = fs
      .readdirSync(path.join(raiz, 'src/server'))
      .map((nombre) => fs.readFileSync(path.join(raiz, 'src/server', nombre), 'utf8'))
      .concat(fs.readFileSync(path.join(raiz, 'src/cli.ts'), 'utf8'))

    for (const codigo of modulos) {
      expect(codigo).not.toMatch(/from\s+'mermaid'|import\(\s*'mermaid'\s*\)/)
    }
  })

  it('declara los metadatos que necesita un paquete publicado', () => {
    expect(pkg.description).toBeTruthy()
    expect(pkg.author).toBeTruthy()
    expect(pkg).not.toHaveProperty('directories')
  })
})
