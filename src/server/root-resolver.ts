import fs from 'node:fs/promises'
import path from 'node:path'
import { constants } from 'node:fs'

export type RootResolution =
  | { ok: true; root: string }
  | {
      ok: false
      reason: 'not-found' | 'missing-dir' | 'not-a-directory' | 'unreadable'
      searchedFrom: string
      requested?: string
    }

const NOMBRE_RAIZ = 'docs'

type EstadoDirectorio = 'ok' | 'missing' | 'not-a-directory' | 'unreadable'

async function comprobarDirectorio(ruta: string): Promise<EstadoDirectorio> {
  let info
  try {
    info = await fs.stat(ruta)
  } catch {
    return 'missing'
  }
  if (!info.isDirectory()) return 'not-a-directory'
  try {
    await fs.access(ruta, constants.R_OK | constants.X_OK)
  } catch {
    return 'unreadable'
  }
  return 'ok'
}

export async function resolveDocsRoot(options: { cwd: string; dir?: string }): Promise<RootResolution> {
  const cwd = path.resolve(options.cwd)

  if (options.dir !== undefined) {
    const requested = path.resolve(cwd, options.dir)
    const estado = await comprobarDirectorio(requested)
    if (estado === 'ok') return { ok: true, root: requested }
    const reason = estado === 'missing' ? 'missing-dir' : estado
    return { ok: false, reason, searchedFrom: cwd, requested }
  }

  let actual = cwd
  for (;;) {
    const candidato = path.join(actual, NOMBRE_RAIZ)
    const estado = await comprobarDirectorio(candidato)
    if (estado === 'ok') return { ok: true, root: candidato }
    if (estado === 'unreadable') {
      return { ok: false, reason: 'unreadable', searchedFrom: cwd, requested: candidato }
    }
    const padre = path.dirname(actual)
    if (padre === actual) return { ok: false, reason: 'not-found', searchedFrom: cwd }
    actual = padre
  }
}
