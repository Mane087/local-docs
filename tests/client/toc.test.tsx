// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { Toc } from '../../src/client/components/Toc.js'
import type { Heading } from '../../src/client/types.js'

const encabezados: Heading[] = [
  { level: 1, id: 'titulo', text: 'Titulo' },
  { level: 2, id: 'requisitos', text: 'Requisitos' },
  { level: 3, id: 'detalle', text: 'Detalle' },
  { level: 4, id: 'muy-profundo', text: 'Muy profundo' },
]

describe('Toc', () => {
  it('muestra los encabezados de nivel 2 y 3 y omite el resto', () => {
    render(<Toc headings={encabezados} activeId={null} onSelect={() => {}} />)

    expect(screen.getByText('Requisitos')).toBeTruthy()
    expect(screen.getByText('Detalle')).toBeTruthy()
    expect(screen.queryByText('Titulo')).toBeNull()
    expect(screen.queryByText('Muy profundo')).toBeNull()
  })

  it('marca el encabezado activo', () => {
    render(<Toc headings={encabezados} activeId="requisitos" onSelect={() => {}} />)

    expect(screen.getByText('Requisitos').getAttribute('aria-current')).toBe('true')
  })

  it('notifica la seleccion al pulsar un encabezado', () => {
    const alSeleccionar = vi.fn()
    render(<Toc headings={encabezados} activeId={null} onSelect={alSeleccionar} />)

    fireEvent.click(screen.getByText('Detalle'))

    expect(alSeleccionar).toHaveBeenCalledWith('detalle')
  })

  it('no se muestra cuando no hay encabezados navegables', () => {
    const { container } = render(
      <Toc headings={[{ level: 1, id: 'titulo', text: 'Titulo' }]} activeId={null} onSelect={() => {}} />,
    )

    expect(container.querySelector('ol')).toBeNull()
  })
})
