import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { spawnHarnessProcess, windowsSpawnSpec } from '../../src/runtime/process.js'

describe('windowsSpawnSpec', () => {
  it('leaves native executables as direct shell-free launches', () => {
    expect(windowsSpawnSpec('dsh.exe', ['web', '--port', '0'])).toEqual({
      command: 'dsh.exe',
      args: ['web', '--port', '0'],
    })
  })

  it('wraps cmd shims in cmd.exe with one safely quoted command token', () => {
    expect(windowsSpawnSpec('C:\\Program Files\\nodejs\\npx.cmd', [
      '--yes',
      '@deepseek-ai/dsh',
      'web',
      '--label',
      'alpha beta',
    ])).toEqual({
      command: process.env.ComSpec ?? 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '""C:\\Program Files\\nodejs\\npx.cmd" --yes @deepseek-ai/dsh web --label "alpha beta""',
      ],
      windowsVerbatimArguments: true,
    })
  })

  it('neutralizes command separators, expansion, and redirection without over-quoting a bare shim', () => {
    const spec = windowsSpawnSpec('runner.cmd', ['safe&whoami', '%PATH%', '!x!', '(group)'])
    expect(spec.args[3]).toBe('runner.cmd "safe^&whoami" "^%PATH^%" "^!x^!" "^(group^)"')
    expect(spec.windowsVerbatimArguments).toBe(true)
  })

  it('rejects quotes and line breaks that cmd cannot preserve safely as one token', () => {
    expect(() => windowsSpawnSpec('runner.cmd', ['a"b'])).toThrow('unsafe')
    expect(() => windowsSpawnSpec('runner.cmd', ['x\r\ny'])).toThrow('unsafe')
  })

  it.runIf(process.platform === 'win32')('starts an installed npm shim with the production spawn spec', async () => {
    const spec = windowsSpawnSpec('npx.cmd', ['--version'])
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments ?? false,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })
      child.once('error', reject)
      child.once('exit', code => resolve({ code, stdout, stderr }))
    })

    expect(result, result.stderr).toMatchObject({ code: 0 })
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u)
  })

  it('flushes a final stdout line that does not end with a newline', async () => {
    const lines: string[] = []
    await new Promise<void>((resolve, reject) => {
      spawnHarnessProcess(process.execPath, ['-e', "process.stdout.write('tail-without-newline')"], {
        cwd: process.cwd(),
        env: process.env,
      }, {
        stdout: line => lines.push(line),
        stderr: () => undefined,
        error: reject,
        exit: code => code === 0 ? resolve() : reject(new Error(`child exited ${code}`)),
      })
    })
    expect(lines).toEqual(['tail-without-newline'])
  })
})
