// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/preact'
import { Viewer } from '../../src/client/components/Viewer.js'
import type { DocResponse } from '../../src/client/types.js'

function documento(html: string, parcial: Partial<DocResponse> = {}): DocResponse {
  return {
    path: 'guia/uso.md',
    title: 'Uso',
    html,
    headings: [],
    frontmatter: {},
    breadcrumb: [{ path: 'guia', title: 'Guia' }],
    warnings: [],
    ...parcial,
  }
}

const conocidas = new Set(['guia/uso.md', 'guia/otro.md'])

describe('Viewer', () => {
  it('inserta el html del documento', () => {
    const { container } = render(
      <Viewer doc={documento('<h1>Uso</h1>')} knownPaths={conocidas} darkMode={false} onNavigate={() => {}} />,
    )

    expect(container.querySelector('h1')?.textContent).toBe('Uso')
  })

  it('navega sin recargar al pulsar un enlace relativo a otro documento', () => {
    const alNavegar = vi.fn()
    const { container } = render(
      <Viewer
        doc={documento('<p><a href="./otro.md#parte">otro</a></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={alNavegar}
      />,
    )

    const enlace = container.querySelector('a') as HTMLAnchorElement
    fireEvent.click(enlace)

    expect(alNavegar).toHaveBeenCalledWith('guia/otro.md', 'parte')
  })

  it('marca como roto un enlace a un documento inexistente y no navega', () => {
    const alNavegar = vi.fn()
    const { container } = render(
      <Viewer
        doc={documento('<p><a href="./inexistente.md">roto</a></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={alNavegar}
      />,
    )

    const enlace = container.querySelector('a') as HTMLAnchorElement
    expect(enlace.getAttribute('data-roto')).toBe('true')

    fireEvent.click(enlace)
    expect(alNavegar).not.toHaveBeenCalled()
  })

  it('no intercepta los enlaces externos', () => {
    const alNavegar = vi.fn()
    const { container } = render(
      <Viewer
        doc={documento('<p><a href="https://ejemplo.com">externo</a></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={alNavegar}
      />,
    )

    fireEvent.click(container.querySelector('a') as HTMLAnchorElement)

    expect(alNavegar).not.toHaveBeenCalled()
  })

  it('marca como roto un enlace markdown que sale de la raiz y no deja que el navegador lo siga', () => {
    const alNavegar = vi.fn()
    const { container } = render(
      <Viewer
        doc={documento('<p><a href="../../fuera.md">fuera</a></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={alNavegar}
      />,
    )

    const enlace = container.querySelector('a') as HTMLAnchorElement
    expect(enlace.getAttribute('data-roto')).toBe('true')

    const noSePrevino = fireEvent.click(enlace)

    expect(noSePrevino).toBe(false)
    expect(alNavegar).not.toHaveBeenCalled()
  })

  it('no intercepta un clic con tecla modificadora sobre un enlace interno valido', () => {
    const alNavegar = vi.fn()
    const { container } = render(
      <Viewer
        doc={documento('<p><a href="./otro.md">otro</a></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={alNavegar}
      />,
    )

    const enlace = container.querySelector('a') as HTMLAnchorElement
    const noSePrevino = fireEvent.click(enlace, { ctrlKey: true })

    expect(noSePrevino).toBe(true)
    expect(alNavegar).not.toHaveBeenCalled()
  })

  it('reescribe las imagenes relativas hacia la ruta de recursos', () => {
    const { container } = render(
      <Viewer
        doc={documento('<p><img src="./imagenes/logo.png" alt="logo" /></p>')}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={() => {}}
      />,
    )

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/assets/guia/imagenes/logo.png')
  })

  it('muestra un aviso cuando el frontmatter es invalido', () => {
    const { container } = render(
      <Viewer
        doc={documento('<h1>Uso</h1>', { warnings: ['frontmatter-invalido'] })}
        knownPaths={conocidas}
        darkMode={false}
        onNavigate={() => {}}
      />,
    )

    expect(container.querySelector('.aviso')?.textContent).toContain('frontmatter')
  })

  it('muestra la ruta de navegacion del documento', () => {
    const { container } = render(
      <Viewer doc={documento('<h1>Uso</h1>')} knownPaths={conocidas} darkMode={false} onNavigate={() => {}} />,
    )

    expect(container.querySelector('.migas')?.textContent).toContain('Guia')
  })
})
