import type { Heading } from '../types.js'

interface Props {
  headings: Heading[]
  activeId: string | null
  onSelect(id: string): void
}

export function Toc({ headings, activeId, onSelect }: Props) {
  const navegables = headings.filter((encabezado) => encabezado.level === 2 || encabezado.level === 3)
  if (navegables.length === 0) return null

  return (
    <>
      <p class="toc-titulo">En esta pagina</p>
      <ol class="toc-lista">
        {navegables.map((encabezado) => (
          <li key={encabezado.id} data-nivel={encabezado.level}>
            <a
              href={`#${encabezado.id}`}
              aria-current={activeId === encabezado.id ? 'true' : undefined}
              onClick={(evento) => {
                evento.preventDefault()
                onSelect(encabezado.id)
              }}
            >
              {encabezado.text}
            </a>
          </li>
        ))}
      </ol>
    </>
  )
}
