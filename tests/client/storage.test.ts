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
})
