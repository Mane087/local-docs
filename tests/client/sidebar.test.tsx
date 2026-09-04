// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Sidebar } from '../../src/client/components/Sidebar.js'
import type { TreeNode } from '../../src/client/types.js'

const arbol: TreeNode[] = [
  {
    type: 'directory',
    path: 'guia',
    title: 'Guia',
    hasIndex: true,
    indexPath: 'guia/index.md',
    children: [
      { type: 'document', path: 'guia/uso.md', title: 'Uso', readable: true },
      { type: 'document', path: 'guia/bloqueado.md', title: 'Bloqueado', readable: false },
    ],
  },
  { type: 'document', path: 'inicio.md', title: 'Inicio', readable: true },
]

beforeEach(() => {
  window.localStorage.clear()
})

describe('Sidebar', () => {
  it('muestra directorios y documentos', () => {
    render(<Sidebar nodes={arbol} rootTitle="Portada" rootIndex="README.md" currentPath={null} onNavigate={() => {}} />)

    expect(screen.getByText('Guia')).toBeTruthy()
    expect(screen.getByText('Inicio')).toBeTruthy()
    expect(screen.getByText('Portada')).toBeTruthy()
  })

  it('oculta los hijos de un directorio contraido y los muestra al expandirlo', () => {
    render(<Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={() => {}} />)

    expect(screen.queryByText('Uso')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /expandir guia/i }))

    expect(screen.getByText('Uso')).toBeTruthy()
  })

  it('notifica la navegacion al seleccionar un documento', () => {
    const alNavegar = vi.fn()
    render(<Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={alNavegar} />)

    fireEvent.click(screen.getByText('Inicio'))

    expect(alNavegar).toHaveBeenCalledWith('inicio.md')
  })

  it('abre el documento indice al seleccionar un directorio que lo tiene', () => {
    const alNavegar = vi.fn()
    render(<Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={alNavegar} />)

    fireEvent.click(screen.getByText('Guia'))

    expect(alNavegar).toHaveBeenCalledWith('guia/index.md')
  })

  it('marca el documento activo', () => {
    render(
      <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath="inicio.md" onNavigate={() => {}} />,
    )

    expect(screen.getByText('Inicio').getAttribute('aria-current')).toBe('page')
  })

  it('expande automaticamente el directorio del documento activo', () => {
    render(
      <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath="guia/uso.md" onNavigate={() => {}} />,
    )

    expect(screen.getByText('Uso')).toBeTruthy()
  })

  it('atenua y deshabilita los documentos ilegibles', () => {
    const alNavegar = vi.fn()
    render(
      <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath="guia/uso.md" onNavigate={alNavegar} />,
    )

    const bloqueado = screen.getByText('Bloqueado')
    expect(bloqueado.getAttribute('data-legible')).toBe('false')

    fireEvent.click(bloqueado)
    expect(alNavegar).not.toHaveBeenCalled()
  })

  it('recuerda los directorios expandidos entre montajes', () => {
    const primera = render(
      <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /expandir guia/i }))
    primera.unmount()

    render(<Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={() => {}} />)

    expect(screen.getByText('Uso')).toBeTruthy()
  })

  it('ignora el estado guardado si es JSON valido pero no es una lista, y sigue funcionando', () => {
    window.localStorage.setItem('local-docs:abiertos', JSON.stringify({}))

    expect(() =>
      render(
        <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={() => {}} />,
      ),
    ).not.toThrow()

    expect(screen.getByText('Guia')).toBeTruthy()
    expect(screen.queryByText('Uso')).toBeNull()
  })

  it('ignora el estado guardado si la lista tiene elementos que no son cadenas, y sigue funcionando', () => {
    window.localStorage.setItem('local-docs:abiertos', JSON.stringify(['guia', 42]))

    expect(() =>
      render(
        <Sidebar nodes={arbol} rootTitle={null} rootIndex={null} currentPath={null} onNavigate={() => {}} />,
      ),
    ).not.toThrow()

    expect(screen.getByText('Guia')).toBeTruthy()
    expect(screen.queryByText('Uso')).toBeNull()
  })
})
