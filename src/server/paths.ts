import fs from 'node:fs/promises'
import path from 'node:path'

export function safeJoin(root: string, relative: string): string | null {
  if (relative.includes('\0')) return null
  if (path.isAbsolute(relative)) return null

  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relative)

  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  return target
}

export function toRelative(root: string, absolute: string): string {
  return path.relative(path.resolve(root), absolute).split(path.sep).join('/')
}

export type PathResolution =
  | { ok: true; path: string }
  | { ok: false; reason: 'outside' | 'missing' }

/**
 * Unica definicion de "esta ruta esta contenida en la raiz". La comprobacion
 * lexica de safeJoin no basta porque fs.stat y fs.readFile siguen los enlaces
 * simbolicos: un enlace dentro de la raiz puede apuntar fuera de ella. Aqui se
 * resuelve el destino real con fs.realpath y se vuelve a comprobar la
 * contencion sobre esa ruta ya resuelta.
 *
 * `raizReal` debe ser la raiz ya pasada por fs.realpath; los llamadores que
 * recorren muchas entradas (el arbol) la calculan una sola vez y la reutilizan.
 *
 * Distingue 'missing' (el destino no existe o el enlace esta roto) de 'outside'
 * (el destino existe pero cae fuera de la raiz) para que la capa HTTP pueda
 * responder 404 o 403 segun corresponda.
 */
export async function resolveRealPath(raizReal: string, absoluto: string): Promise<PathResolution> {
  let destinoReal: string
  try {
    destinoReal = await fs.realpath(absoluto)
  } catch {
    return { ok: false, reason: 'missing' }
  }

  if (safeJoin(raizReal, path.relative(raizReal, destinoReal)) === null) {
    return { ok: false, reason: 'outside' }
  }
  return { ok: true, path: destinoReal }
}

/**
 * Version para la capa HTTP: parte de una ruta relativa pedida por el cliente,
 * aplica la comprobacion lexica y despues la comprobacion real de
 * resolveRealPath. Solo se llama justo antes de tocar el disco, no en cada
 * composicion de ruta.
 */
export async function resolveWithinRoot(root: string, relative: string): Promise<PathResolution> {
  const lexico = safeJoin(root, relative)
  if (lexico === null) return { ok: false, reason: 'outside' }

  let raizReal: string
  try {
    raizReal = await fs.realpath(root)
  } catch {
    return { ok: false, reason: 'missing' }
  }

  return resolveRealPath(raizReal, lexico)
}
