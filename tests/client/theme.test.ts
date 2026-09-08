// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { h } from 'preact'
import { ThemeToggle } from '../../src/client/components/ThemeToggle.js'
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

  it('representa cada tema con su icono y conserva el ciclo de cambio', () => {
    const alCambiar = vi.fn()
    const vista = render(h(ThemeToggle, { tema: 'sistema', onChange: alCambiar }))

    let boton = screen.getByRole('button', { name: 'Tema del sistema' })
    expect(boton.querySelector('img')?.getAttribute('src')).toContain('system.svg')
    fireEvent.click(boton)
    expect(alCambiar).toHaveBeenLastCalledWith('claro')

    vista.rerender(h(ThemeToggle, { tema: 'claro', onChange: alCambiar }))
    boton = screen.getByRole('button', { name: 'Tema claro' })
    expect(boton.querySelector('img')?.getAttribute('src')).toContain('sun.svg')
    fireEvent.click(boton)
    expect(alCambiar).toHaveBeenLastCalledWith('oscuro')

    vista.rerender(h(ThemeToggle, { tema: 'oscuro', onChange: alCambiar }))
    boton = screen.getByRole('button', { name: 'Tema oscuro' })
    expect(boton.querySelector('img')?.getAttribute('src')).toContain('moon.svg')
    fireEvent.click(boton)
    expect(alCambiar).toHaveBeenLastCalledWith('sistema')
  })
})
