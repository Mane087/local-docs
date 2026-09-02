const PREFIJO = /^(\d{1,4})[-_.](.+)$/
const EXTENSIONES = /\.(md|markdown)$/i

export interface SortableEntry {
  type: 'directory' | 'document'
  order: number | null
  prefixOrder: number | null
  name: string
}

export function stripOrderPrefix(name: string): { prefixOrder: number | null; rest: string } {
  const coincidencia = PREFIJO.exec(name)
  if (!coincidencia) return { prefixOrder: null, rest: name }
  return { prefixOrder: Number(coincidencia[1]), rest: coincidencia[2] as string }
}

export function humanizeName(name: string): string {
  const sinExtension = name.replace(EXTENSIONES, '')
  const { rest } = stripOrderPrefix(sinExtension)
  const palabras = rest.replace(/[-_]+/g, ' ').trim()
  if (palabras.length === 0) return sinExtension
  return palabras.charAt(0).toUpperCase() + palabras.slice(1)
}

const colador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

function pesoDeTipo(entry: SortableEntry): number {
  return entry.type === 'directory' ? 0 : 1
}

export function compareEntries(a: SortableEntry, b: SortableEntry): number {
  const tipo = pesoDeTipo(a) - pesoDeTipo(b)
  if (tipo !== 0) return tipo

  const ordenA = a.order ?? a.prefixOrder
  const ordenB = b.order ?? b.prefixOrder
  if (ordenA !== null && ordenB !== null && ordenA !== ordenB) return ordenA - ordenB
  if (ordenA !== null && ordenB === null) return -1
  if (ordenA === null && ordenB !== null) return 1

  return colador.compare(a.name, b.name)
}
