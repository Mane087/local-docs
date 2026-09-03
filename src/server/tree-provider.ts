import { buildTree, type TreeResult } from './tree.js'

export interface TreeProvider {
  get(): Promise<TreeResult>
  invalidate(): void
}

export function createTreeProvider(root: string): TreeProvider {
  let pendiente: Promise<TreeResult> | null = null

  return {
    get(): Promise<TreeResult> {
      if (pendiente === null) pendiente = buildTree(root)
      return pendiente
    },
    invalidate(): void {
      pendiente = null
    },
  }
}
