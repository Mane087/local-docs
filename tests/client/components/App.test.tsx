// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/preact'
import { App } from '../../../src/client/components/App.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('muestra un estado de error cuando falla la carga del arbol, en lugar de quedarse cargando', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fallo de red')))

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText(/no se pudo cargar el indice de documentacion/i).length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('Cargando...')).toBeNull()
    expect(screen.queryByText('Cargando documento...')).toBeNull()
  })
})
