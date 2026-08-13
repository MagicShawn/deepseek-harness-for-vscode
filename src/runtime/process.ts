import { spawn } from 'node:child_process'
import path from 'node:path'
import type { ProcessHandle, ProcessSpawner } from './manager.js'

export interface SpawnSpec {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

function quoteCmdToken(value: string): string {
  if (/[\0\r\n"]/u.test(value)) throw new Error('Windows batch command contains an unsafe quote or control character')
  const escaped = value
    .replaceAll('^', '^^')
    .replaceAll('&', '^&')
    .replaceAll('|', '^|')
    .replaceAll('<', '^<')
    .replaceAll('>', '^>')
    .replaceAll('%', '^%')
    .replaceAll('!', '^!')
    .replaceAll('(', '^(')
    .replaceAll(')', '^)')
  return /[\s&|<>^%!()]/u.test(value) ? `"${escaped}"` : escaped
}

export function windowsSpawnSpec(command: string, args: string[]): SpawnSpec {
  if (!['.cmd', '.bat'].includes(path.win32.extname(command).toLowerCase())) return { command, args }
  const commandToken = quoteCmdToken(command)
  const commandLine = [commandToken, ...args.map(quoteCmdToken)].join(' ')
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', commandToken.startsWith('"') ? `"${commandLine}"` : commandLine],
    windowsVerbatimArguments: true,
  }
}

interface LineSink {
  write(chunk: Buffer | string): void
  flush(): void
}

function lineSink(callback: (line: string) => void): LineSink {
  let buffered = ''
  return {
    write(chunk) {
      buffered += chunk.toString()
      const lines = buffered.split(/\r?\n/u)
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        if (line !== '') callback(line)
      }
    },
    flush() {
      if (buffered !== '') callback(buffered)
      buffered = ''
    },
  }
}

async function terminateTree(pid: number | undefined): Promise<void> {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('exit', () => resolve())
      killer.once('error', () => resolve())
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try { process.kill(pid, 'SIGTERM') } catch { /* already stopped */ }
  }
}

export const spawnHarnessProcess: ProcessSpawner = (command, args, options, callbacks): ProcessHandle => {
  const spec = process.platform === 'win32' ? windowsSpawnSpec(command, args) : { command, args }
  const child = spawn(spec.command, spec.args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    windowsVerbatimArguments: spec.windowsVerbatimArguments ?? false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = lineSink(callbacks.stdout)
  const stderr = lineSink(callbacks.stderr)
  child.stdout.on('data', chunk => stdout.write(chunk as Buffer))
  child.stderr.on('data', chunk => stderr.write(chunk as Buffer))
  child.stdout.once('end', stdout.flush)
  child.stderr.once('end', stderr.flush)
  child.once('error', error => callbacks.error(new Error(`Unable to start ${command}: ${error.message}`)))
  child.once('close', callbacks.exit)
  return {
    pid: child.pid,
    kill: async () => terminateTree(child.pid),
  }
}
