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
