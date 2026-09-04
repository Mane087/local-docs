// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Search } from '../../src/client/components/Search.js'
import { searchDocs } from '../../src/client/api.js'

vi.mock('../../src/client/api.js', () => ({ searchDocs: vi.fn() }))

afterEach(() => {
  vi.mocked(searchDocs).mockReset()
})

function respuestaBusqueda(resultados: Array<{ path: string; title: string }>) {
  return {
    status: 'ready' as const,
    results: resultados.map((resultado) => ({
      path: resultado.path,
      title: resultado.title,
      score: 1,
      fragments: ['texto con <mark>coincidencia</mark>'],
    })),
  }
}

describe('Search', () => {
  it('no muestra nada cuando esta cerrado', () => {
    const { container } = render(<Search abierto={false} onClose={() => {}} onSelect={() => {}} />)

    expect(container.querySelector('input')).toBeNull()
  })

  it('consulta al escribir y muestra los resultados con sus fragmentos', async () => {
    vi.mocked(searchDocs).mockResolvedValue(respuestaBusqueda([{ path: 'guia/uso.md', title: 'Uso' }]))

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'node' } })

    await waitFor(() => expect(screen.getByText('Uso')).toBeTruthy())
    expect(searchDocs).toHaveBeenCalledWith('node')
    expect(document.querySelector('.resultado-fragmento mark')).toBeTruthy()
  })

  it('informa mientras el indice se esta construyendo', async () => {
    vi.mocked(searchDocs).mockResolvedValue({ status: 'indexing', results: [] })

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'node' } })

    await waitFor(() => expect(screen.getByText(/indexando/i)).toBeTruthy())
  })

  it('muestra el estado vacio cuando no hay coincidencias', async () => {
    vi.mocked(searchDocs).mockResolvedValue(respuestaBusqueda([]))

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzz' } })

    await waitFor(() => expect(screen.getByText(/sin resultados/i)).toBeTruthy())
  })

  it('recorre los resultados con las flechas y abre con Enter', async () => {
    vi.mocked(searchDocs).mockResolvedValue(
      respuestaBusqueda([
        { path: 'a.md', title: 'Primero' },
        { path: 'b.md', title: 'Segundo' },
      ]),
    )
    const alSeleccionar = vi.fn()

    render(<Search abierto onClose={() => {}} onSelect={alSeleccionar} />)
    const entrada = screen.getByRole('searchbox')
    fireEvent.input(entrada, { target: { value: 'x' } })
    await waitFor(() => expect(screen.getByText('Primero')).toBeTruthy())

    fireEvent.keyDown(entrada, { key: 'ArrowDown' })
    fireEvent.keyDown(entrada, { key: 'Enter' })

    expect(alSeleccionar).toHaveBeenCalledWith('b.md')
  })

  it('cierra con Escape', () => {
    const alCerrar = vi.fn()
    render(<Search abierto onClose={alCerrar} onSelect={() => {}} />)

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })

    expect(alCerrar).toHaveBeenCalled()
  })

  it('muestra un estado de error cuando la peticion de busqueda falla', async () => {
    vi.mocked(searchDocs).mockRejectedValue(new Error('fallo de red'))

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'node' } })

    await waitFor(() => expect(screen.getByText(/no se pudo completar la busqueda/i)).toBeTruthy())
  })

  it('informa cuando el indice todavia se esta construyendo', async () => {
    vi.mocked(searchDocs).mockResolvedValue({ status: 'indexing', results: [] })

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'node' } })

    await waitFor(() => expect(screen.getByText(/indexando/i)).toBeTruthy())
    expect(screen.queryByText(/sin resultados/i)).toBeNull()
  })

  it('expone el resultado activo en el marcado al recorrer con las flechas', async () => {
    vi.mocked(searchDocs).mockResolvedValue(
      respuestaBusqueda([
        { path: 'a.md', title: 'Primero' },
        { path: 'b.md', title: 'Segundo' },
      ]),
    )

    render(<Search abierto onClose={() => {}} onSelect={() => {}} />)
    const entrada = screen.getByRole('searchbox')
    fireEvent.input(entrada, { target: { value: 'x' } })
    await waitFor(() => expect(screen.getByText('Primero')).toBeTruthy())

    const primero = screen.getByText('Primero').closest('[role="option"]') as HTMLElement
    const segundo = screen.getByText('Segundo').closest('[role="option"]') as HTMLElement
    expect(primero.getAttribute('aria-selected')).toBe('true')
    expect(segundo.getAttribute('aria-selected')).toBe('false')
    expect(entrada.getAttribute('aria-activedescendant')).toBe(primero.id)

    fireEvent.keyDown(entrada, { key: 'ArrowDown' })

    expect(primero.getAttribute('aria-selected')).toBe('false')
    expect(segundo.getAttribute('aria-selected')).toBe('true')
    expect(entrada.getAttribute('aria-activedescendant')).toBe(segundo.id)
  })
})
