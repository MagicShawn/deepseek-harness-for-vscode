import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executableCandidates, findCommand } from '../../src/runtime/discovery.js'

describe('executableCandidates', () => {
  it('expands PATHEXT only on Windows and preserves PATH order', () => {
    expect(executableCandidates('dsh', {
      platform: 'win32',
      pathValue: 'C:\\tools;D:\\bin',
      pathExt: '.COM;.EXE;.CMD',
    })).toEqual([
      path.join('C:\\tools', 'dsh.COM'),
      path.join('C:\\tools', 'dsh.EXE'),
      path.join('C:\\tools', 'dsh.CMD'),
      path.join('D:\\bin', 'dsh.COM'),
      path.join('D:\\bin', 'dsh.EXE'),
      path.join('D:\\bin', 'dsh.CMD'),
    ])
  })

  it('uses the literal command name on POSIX', () => {
    expect(executableCandidates('dsh', {
      platform: 'linux',
      pathValue: '/usr/local/bin:/usr/bin',
      pathExt: '',
    })).toEqual(['/usr/local/bin/dsh', '/usr/bin/dsh'])
  })

  it('returns the exact executable path that exists instead of only a boolean', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dsh-vscode-discovery-'))
    const candidate = path.join(directory, process.platform === 'win32' ? 'dsh.CMD' : 'dsh')
    await writeFile(candidate, '')
    if (process.platform !== 'win32') await chmod(candidate, 0o755)
    const environment = process.platform === 'win32'
      ? { PATH: directory, PATHEXT: '.CMD' }
      : { PATH: directory }

    await expect(findCommand('dsh', environment)).resolves.toBe(candidate)
  })
})
