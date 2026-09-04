// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { escribirJson, leerJson } from '../../src/client/storage.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('almacenamiento local', () => {
  it('devuelve el valor alternativo cuando la clave no existe', () => {
    expect(leerJson('inexistente', ['a'])).toEqual(['a'])
  })

  it('guarda y recupera un valor', () => {
    escribirJson('abiertos', ['guia'])
    expect(leerJson('abiertos', [])).toEqual(['guia'])
  })

  it('devuelve el valor alternativo cuando el contenido esta corrupto', () => {
    window.localStorage.setItem('abiertos', '{no es json')
    expect(leerJson('abiertos', [])).toEqual([])
  })

  const esListaDeCadenas = (valor: unknown): valor is string[] =>
    Array.isArray(valor) && valor.every((elemento) => typeof elemento === 'string')

  it('devuelve el valor alternativo cuando el JSON es valido pero no cumple el predicado', () => {
    window.localStorage.setItem('abiertos', JSON.stringify({}))
    expect(leerJson('abiertos', [], esListaDeCadenas)).toEqual([])
  })

  it('devuelve el valor alternativo cuando la lista contiene elementos que no son cadenas', () => {
    window.localStorage.setItem('abiertos', JSON.stringify(['guia', 42]))
    expect(leerJson('abiertos', [], esListaDeCadenas)).toEqual([])
  })

  it('acepta el valor cuando cumple el predicado', () => {
    window.localStorage.setItem('abiertos', JSON.stringify(['guia']))
    expect(leerJson('abiertos', [], esListaDeCadenas)).toEqual(['guia'])
  })
})
