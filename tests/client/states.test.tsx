// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import {
  DocumentacionNoDisponible,
  ErrorDocumento,
  EstadoVacio,
  SinConexion,
} from '../../src/client/components/States.js'

describe('estados', () => {
  it('el estado vacio explica que se esperaba y muestra la ruta inspeccionada', () => {
    render(<EstadoVacio root="/proyecto/docs" />)

    expect(screen.getByText(/\/proyecto\/docs/)).toBeTruthy()
    expect(screen.getByText(/no contiene documentos/i)).toBeTruthy()
  })

  it('el error 404 ofrece volver al inicio', () => {
    const alInicio = vi.fn()
    render(<ErrorDocumento codigo={404} onInicio={alInicio} />)

    expect(screen.getByText(/no se encontro/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /inicio/i }))
    expect(alInicio).toHaveBeenCalled()
  })

  it('el error 403 explica que la ruta esta fuera de la documentacion', () => {
    render(<ErrorDocumento codigo={403} onInicio={() => {}} />)

    expect(screen.getByText(/fuera de la documentacion/i)).toBeTruthy()
  })

  it('el aviso de conexion es discreto y describe el estado', () => {
    render(<SinConexion />)

    expect(screen.getByText(/sin conexion/i)).toBeTruthy()
  })

  it('el estado de raiz no disponible explica la situacion', () => {
    render(<DocumentacionNoDisponible />)

    expect(screen.getByText(/no esta disponible/i)).toBeTruthy()
  })
})
