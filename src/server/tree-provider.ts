import { buildTree, type TreeResult } from './tree.js'

export interface TreeProvider {
  get(): Promise<TreeResult>
  invalidate(): void
}

export function createTreeProvider(root: string): TreeProvider {
  let pendiente: Promise<TreeResult> | null = null

  return {
    get(): Promise<TreeResult> {
      if (pendiente === null) {
        const construccion = buildTree(root)
        pendiente = construccion
        // Si la construccion falla, no se memoiza el rechazo: se limpia
        // `pendiente` para que la siguiente llamada a get() reintente. Solo
        // se limpia si sigue siendo esta misma promesa la memoizada -si
        // mientras tanto invalidate() ya la reemplazo por otra, esa otra no
        // se toca. El rechazo en si se sigue propagando a quien awaitee la
        // promesa devuelta mas abajo; este catch es un efecto colateral
        // aparte, no altera lo que reciben los llamadores.
        construccion.catch(() => {
          if (pendiente === construccion) pendiente = null
        })
      }
      return pendiente
    },
    invalidate(): void {
      pendiente = null
    },
  }
}
