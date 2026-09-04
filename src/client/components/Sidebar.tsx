import { useEffect, useMemo, useState } from 'preact/hooks'
import { esClicPrimario } from '../dom.js'
import { docUrl } from '../router.js'
import { escribirJson, leerJson } from '../storage.js'
import type { DirectoryNode, TreeNode } from '../types.js'

const CLAVE_ABIERTOS = 'local-docs:abiertos'

interface Props {
  nodes: TreeNode[]
  rootTitle: string | null
  rootIndex: string | null
  currentPath: string | null
  onNavigate(path: string): void
}

function ancestros(currentPath: string | null): string[] {
  if (currentPath === null) return []
  const segmentos = currentPath.split('/')
  segmentos.pop()
  const rutas: string[] = []
  let acumulado = ''
  for (const segmento of segmentos) {
    acumulado = acumulado === '' ? segmento : `${acumulado}/${segmento}`
    rutas.push(acumulado)
  }
  return rutas
}

// Un JSON valido pero con otra forma (`{}`, `"x"`, `42`, o una lista con
// elementos que no son cadenas) se trata como estado corrupto: se descarta
// la lista completa en vez de filtrar los elementos invalidos uno a uno. Es
// mas simple y predecible, y evita confiar parcialmente en una estructura
// que ya demostro no venir de esta aplicacion.
function esListaDeCadenas(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((elemento) => typeof elemento === 'string')
}

export function Sidebar({ nodes, rootTitle, rootIndex, currentPath, onNavigate }: Props) {
  const [abiertos, setAbiertos] = useState<string[]>(() =>
    leerJson<string[]>(CLAVE_ABIERTOS, [], esListaDeCadenas),
  )

  useEffect(() => {
    escribirJson(CLAVE_ABIERTOS, abiertos)
  }, [abiertos])

  const expandidos = useMemo(
    () => new Set([...abiertos, ...ancestros(currentPath)]),
    [abiertos, currentPath],
  )

  const alternar = (ruta: string): void => {
    setAbiertos((previos) =>
      previos.includes(ruta) ? previos.filter((p) => p !== ruta) : [...previos, ruta],
    )
  }

  // Enlace real: un <a href> es alcanzable y operable con teclado de forma nativa
  // (Enter activa el elemento sin manejadores adicionales) y permite abrir en
  // pestaña nueva o copiar el enlace. Interceptamos solo el clic primario sin
  // modificadores para navegar dentro de la aplicacion.
  const manejarNavegacion = (event: MouseEvent, path: string): void => {
    if (!esClicPrimario(event)) return
    event.preventDefault()
    onNavigate(path)
  }

  const pintarDirectorio = (node: DirectoryNode) => {
    const abierto = expandidos.has(node.path)
    const indice = node.indexPath
    return (
      <li key={node.path} class="rama">
        <div class="rama-cabecera">
          <button
            type="button"
            class="rama-alternar"
            aria-expanded={abierto}
            aria-label={`${abierto ? 'Contraer' : 'Expandir'} ${node.title}`}
            onClick={() => alternar(node.path)}
          >
            {abierto ? '▾' : '▸'}
          </button>
          {indice !== null ? (
            <a
              class="rama-titulo"
              href={docUrl(indice)}
              aria-current={indice === currentPath ? 'page' : undefined}
              onClick={(event) => manejarNavegacion(event, indice)}
            >
              {node.title}
            </a>
          ) : (
            <span class="rama-titulo" onClick={() => alternar(node.path)}>
              {node.title}
            </span>
          )}
        </div>
        {abierto ? <ul class="rama-hijos">{node.children.map(pintarNodo)}</ul> : null}
      </li>
    )
  }

  const pintarNodo = (node: TreeNode) => {
    if (node.type === 'directory') return pintarDirectorio(node)
    return (
      <li key={node.path} class="hoja">
        {node.readable ? (
          <a
            class="hoja-titulo"
            href={docUrl(node.path)}
            data-legible="true"
            aria-current={node.path === currentPath ? 'page' : undefined}
            onClick={(event) => manejarNavegacion(event, node.path)}
          >
            {node.title}
          </a>
        ) : (
          <span
            class="hoja-titulo"
            data-legible="false"
            aria-disabled="true"
            title="No se puede leer este archivo"
          >
            {node.title}
          </span>
        )}
      </li>
    )
  }

  return (
    <nav aria-label="Documentacion">
      {rootIndex !== null ? (
        <button type="button" class="portada" onClick={() => onNavigate(rootIndex)}>
          {rootTitle ?? 'Inicio'}
        </button>
      ) : null}
      <ul class="arbol">{nodes.map(pintarNodo)}</ul>
    </nav>
  )
}
