import { describe, expect, it } from 'vitest'
import { parseCommandLine, resolveLaunchPlan } from '../../src/domain/launch.js'

describe('resolveLaunchPlan', () => {
  it('uses a healthy-looking external URL in auto mode without creating a process', () => {
    expect(resolveLaunchPlan({ mode: 'auto', externalUrl: 'http://127.0.0.1:3080', port: 0 }, 'dsh', 'linux'))
      .toEqual({ kind: 'external', url: 'http://127.0.0.1:3080/' })
  })

  it('rejects external mode when no valid HTTP URL was configured', () => {
    expect(() => resolveLaunchPlan({ mode: 'external', externalUrl: 'file:///tmp/ui', port: 0 }, 'dsh', 'linux'))
      .toThrow('externalUrl')
  })

  it('rejects credential-bearing external URLs before probing or proxying them', () => {
    expect(() => resolveLaunchPlan({ mode: 'external', externalUrl: 'http://user:pass@127.0.0.1:3080', port: 0 }, undefined, 'linux'))
      .toThrow('credentials')
  })

  it('uses a quoted custom executable and preserves its arguments', () => {
    expect(resolveLaunchPlan({
      mode: 'managed',
      externalUrl: '',
      command: '"C:\\Program Files\\dsh\\dsh.exe" --trace',
      port: 4312,
    }, undefined, 'win32')).toEqual({
      kind: 'managed',
      command: 'C:\\Program Files\\dsh\\dsh.exe',
      args: ['--trace', 'web', '--host', '127.0.0.1', '--port', '4312'],
    })
  })

  it('uses dsh from PATH before the npx fallback', () => {
    expect(resolveLaunchPlan({ mode: 'managed', externalUrl: '', port: 0 }, '/usr/local/bin/dsh', 'linux'))
      .toEqual({
        kind: 'managed',
        command: '/usr/local/bin/dsh',
        args: ['web', '--host', '127.0.0.1', '--port', '0'],
      })
  })

  it('uses the exact executable discovered on Windows PATH', () => {
    expect(resolveLaunchPlan({ mode: 'managed', externalUrl: '', port: 0 }, 'C:\\tools\\dsh.exe', 'win32'))
      .toMatchObject({ kind: 'managed', command: 'C:\\tools\\dsh.exe' })
  })

  it('falls back to the platform npx launcher when dsh is unavailable', () => {
    expect(resolveLaunchPlan({ mode: 'auto', externalUrl: '', port: 0 }, undefined, 'win32'))
      .toEqual({
        kind: 'managed',
        command: 'npx.cmd',
        args: ['--yes', '@deepseek-ai/dsh', 'web', '--host', '127.0.0.1', '--port', '0'],
      })
  })
})

describe('parseCommandLine', () => {
  it('parses spaces and escaped quotes without invoking a shell', () => {
    expect(parseCommandLine('runner --label "alpha beta" "say \\"hi\\""'))
      .toEqual(['runner', '--label', 'alpha beta', 'say "hi"'])
  })

  it('refuses an unclosed quote', () => {
    expect(() => parseCommandLine('dsh "broken')).toThrow('quote')
  })
})
