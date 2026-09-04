import type { Tema } from '../theme.js'

const SIGUIENTE: Record<Tema, Tema> = { sistema: 'claro', claro: 'oscuro', oscuro: 'sistema' }
const ETIQUETA: Record<Tema, string> = { sistema: 'Tema del sistema', claro: 'Tema claro', oscuro: 'Tema oscuro' }

interface Props {
  tema: Tema
  onChange(tema: Tema): void
}

export function ThemeToggle({ tema, onChange }: Props) {
  return (
    <button type="button" class="tema" onClick={() => onChange(SIGUIENTE[tema])} aria-label={ETIQUETA[tema]}>
      {ETIQUETA[tema]}
    </button>
  )
}
