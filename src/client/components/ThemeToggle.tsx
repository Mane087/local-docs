import { useEffect, useState } from 'preact/hooks'
import { aplicarTema, guardarTema, leerTema, type Tema } from '../theme.js'

const SIGUIENTE: Record<Tema, Tema> = { sistema: 'claro', claro: 'oscuro', oscuro: 'sistema' }
const ETIQUETA: Record<Tema, string> = { sistema: 'Tema del sistema', claro: 'Tema claro', oscuro: 'Tema oscuro' }

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(() => leerTema())

  useEffect(() => {
    aplicarTema(tema)
    guardarTema(tema)
  }, [tema])

  useEffect(() => {
    if (tema !== 'sistema') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (): void => aplicarTema('sistema')
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [tema])

  return (
    <button type="button" class="tema" onClick={() => setTema(SIGUIENTE[tema])} aria-label={ETIQUETA[tema]}>
      {ETIQUETA[tema]}
    </button>
  )
}
