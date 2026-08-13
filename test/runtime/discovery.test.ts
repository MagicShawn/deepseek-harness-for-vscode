import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executableCandidates } from '../../src/runtime/discovery.js'

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
})
