import type { Tema } from '../theme.js'
import moonIcono from '../../../assets/dark/moon.svg'
import sunIcono from '../../../assets/light/sun.svg'
import systemIconoClaro from '../../../assets/light/system.svg'
import systemIconoOscuro from '../../../assets/dark/system.svg'

const SIGUIENTE: Record<Tema, Tema> = { sistema: 'claro', claro: 'oscuro', oscuro: 'sistema' }
const ETIQUETA: Record<Tema, string> = { sistema: 'Tema del sistema', claro: 'Tema claro', oscuro: 'Tema oscuro' }

// El boton muestra el tema activo. Los SVG llevan el color escrito en el
// archivo, asi que el sol solo existe en la variante clara y la luna en la
// oscura, que son los temas en los que se pueden ver; el icono de sistema si
// necesita las dos, porque acompana a cualquiera de los dos fondos.
function icono(tema: Tema, oscuro: boolean): string {
  if (tema === 'claro') return sunIcono
  if (tema === 'oscuro') return moonIcono
  return oscuro ? systemIconoOscuro : systemIconoClaro
}

interface Props {
  tema: Tema
  oscuro?: boolean
  onChange(tema: Tema): void
}

export function ThemeToggle({ tema, oscuro = false, onChange }: Props) {
  return (
    <button type="button" class="tema" onClick={() => onChange(SIGUIENTE[tema])} aria-label={ETIQUETA[tema]}>
      <img class="icono" src={icono(tema, oscuro)} alt="" />
    </button>
  )
}
