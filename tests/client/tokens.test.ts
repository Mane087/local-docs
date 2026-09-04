import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// El spec (seccion 8.5) exige 4.5:1 en el texto y 3:1 en elementos de
// interfaz. --texto-terciario se usa tanto en texto (migas, titulo de la
// tabla de contenidos, documentos ilegibles) como en un control (el boton de
// expandir del arbol), asi que se comprueba contra el umbral de texto.
const MINIMO_TEXTO = 4.5

const raiz = path.dirname(fileURLToPath(import.meta.url))
const css = fs.readFileSync(path.join(raiz, '../../src/client/styles/tokens.css'), 'utf8')

function bloque(selector: string): string {
  const inicio = css.indexOf(selector)
  expect(inicio, `no se encontro el selector ${selector}`).toBeGreaterThanOrEqual(0)
  const abre = css.indexOf('{', inicio)
  return css.slice(abre, css.indexOf('}', abre))
}

function hsl(texto: string, nombre: string): [number, number, number] {
  const expresion = new RegExp(`--${nombre}:\\s*hsl\\(([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\)`)
  const encontrado = expresion.exec(texto)
  expect(encontrado, `no se encontro --${nombre}`).not.toBeNull()
  const [, h, s, l] = encontrado as RegExpExecArray
  return [Number(h), Number(s), Number(l)]
}

function aRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const saturacion = s / 100
  const luz = l / 100
  const c = (1 - Math.abs(2 * luz - 1)) * saturacion
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = luz - c / 2
  const sector: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ]
  const [r, g, b] = sector[Math.floor(h / 60) % 6] as [number, number, number]
  return [r + m, g + m, b + m]
}

function luminancia(color: [number, number, number]): number {
  const [r, g, b] = color.map((valor) =>
    valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [claro, oscuro] = [luminancia(aRgb(a)), luminancia(aRgb(b))].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (claro + 0.05) / (oscuro + 0.05)
}

describe('contraste de los tokens de color', () => {
  it('--texto-terciario supera 4.5:1 en tema claro sobre los dos fondos', () => {
    const tema = bloque(':root {')
    const texto = hsl(tema, 'texto-terciario')

    expect(contraste(texto, hsl(tema, 'fondo'))).toBeGreaterThanOrEqual(MINIMO_TEXTO)
    expect(contraste(texto, hsl(tema, 'fondo-elevado'))).toBeGreaterThanOrEqual(MINIMO_TEXTO)
  })

  it("--texto-terciario supera 4.5:1 en tema oscuro sobre los dos fondos", () => {
    const tema = bloque(":root[data-tema='oscuro'] {")
    const texto = hsl(tema, 'texto-terciario')

    expect(contraste(texto, hsl(tema, 'fondo'))).toBeGreaterThanOrEqual(MINIMO_TEXTO)
    expect(contraste(texto, hsl(tema, 'fondo-elevado'))).toBeGreaterThanOrEqual(MINIMO_TEXTO)
  })
})
