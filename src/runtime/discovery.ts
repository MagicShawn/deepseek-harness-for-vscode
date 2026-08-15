import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import type { RuntimePlatform } from '../domain/launch.js'

export interface DiscoveryEnvironment {
  platform: RuntimePlatform
  pathValue: string
  pathExt: string
}

export function executableCandidates(command: string, environment: DiscoveryEnvironment): string[] {
  const delimiter = environment.platform === 'win32' ? ';' : ':'
  const directories = environment.pathValue.split(delimiter).filter(Boolean)
  if (environment.platform !== 'win32') return directories.map(directory => path.posix.join(directory, command))
  const extensions = environment.pathExt.split(';').filter(Boolean)
  return directories.flatMap(directory => extensions.map(extension => path.win32.join(directory, `${command}${extension}`)))
}

export async function findCommand(command: string, environment: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const candidates = executableCandidates(command, {
    platform: process.platform,
    pathValue: environment.PATH ?? environment.Path ?? '',
    pathExt: environment.PATHEXT ?? environment.PathExt ?? '.COM;.EXE;.BAT;.CMD',
  })
  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

export async function commandExists(command: string, environment: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return await findCommand(command, environment) !== undefined
}
