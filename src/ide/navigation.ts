import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseFileLocation } from '../domain/fileLocation.js'

export interface ResolvedFileLocation {
  absolutePath: string
  line: number
  column: number
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function regularFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

async function containedByRealPath(root: string, candidate: string): Promise<boolean> {
  try {
    return contained(await realpath(root), await realpath(candidate))
  } catch {
    return false
  }
}

export async function resolveExistingFileLocation(
  value: string,
  workspaceRoots: string[],
): Promise<ResolvedFileLocation | undefined> {
  const parsed = parseFileLocation(value)
  if (parsed === undefined) return undefined

  const candidates = path.isAbsolute(parsed.path)
    ? [path.resolve(parsed.path)]
    : workspaceRoots.map(root => path.resolve(root, parsed.path)).filter(candidate =>
      workspaceRoots.some(root => contained(root, candidate)),
    )

  for (const candidate of candidates) {
    if (!await regularFile(candidate)) continue
    if (!path.isAbsolute(parsed.path)) {
      const inside = await Promise.all(workspaceRoots.map(root => containedByRealPath(root, candidate)))
      if (!inside.some(Boolean)) continue
    }
    return {
      absolutePath: candidate,
      line: (parsed.line ?? 1) - 1,
      column: (parsed.column ?? 1) - 1,
    }
  }
  return undefined
}
