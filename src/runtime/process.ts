import { spawn } from 'node:child_process'
import type { ProcessHandle, ProcessSpawner } from './manager.js'

function lineSink(callback: (line: string) => void): (chunk: Buffer | string) => void {
  let buffered = ''
  return chunk => {
    buffered += chunk.toString()
    const lines = buffered.split(/\r?\n/u)
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      if (line !== '') callback(line)
    }
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
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', lineSink(callbacks.stdout))
  child.stderr.on('data', lineSink(callbacks.stderr))
  child.once('error', error => callbacks.stderr(`Unable to start ${command}: ${error.message}`))
  child.once('exit', callbacks.exit)
  return {
    pid: child.pid,
    kill: async () => terminateTree(child.pid),
  }
}
