// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aplicarTema, guardarTema, leerTema, temaEfectivo } from '../../src/client/theme.js'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-tema')
})

describe('tema', () => {
  it('usa la preferencia del sistema por omision', () => {
    expect(leerTema()).toBe('sistema')
  })

  it('guarda y recupera la eleccion manual', () => {
    guardarTema('oscuro')
    expect(leerTema()).toBe('oscuro')
  })

  it('ignora un valor almacenado invalido', () => {
    window.localStorage.setItem('local-docs:tema', 'fucsia')
    expect(leerTema()).toBe('sistema')
  })

  it('resuelve el tema del sistema con la consulta de medios', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    )

    expect(temaEfectivo('sistema')).toBe('oscuro')
    expect(temaEfectivo('claro')).toBe('claro')

    vi.unstubAllGlobals()
  })

  it('escribe el atributo data-tema en el elemento raiz', () => {
    aplicarTema('oscuro')
    expect(document.documentElement.getAttribute('data-tema')).toBe('oscuro')
  })
})
