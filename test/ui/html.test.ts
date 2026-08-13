import { describe, expect, it } from 'vitest'
import { createShellHtml } from '../../src/ui/html.js'

describe('createShellHtml', () => {
  it('escapes an attacker-controlled frame URL and pins scripts to one nonce', () => {
    const html = createShellHtml({
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      initialStatus: { state: 'starting' },
    })
    expect(html).toContain("script-src 'nonce-fixed-nonce'")
    expect(html).toContain('<script nonce="fixed-nonce">')
    expect(html).not.toContain('unsafe-inline')
    expect(html).toContain('frame-src http://127.0.0.1:*')
  })

  it('renders localized loading, ready, and actionable error surfaces from messages', () => {
    const html = createShellHtml({
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      initialStatus: { state: 'stopped' },
    })
    expect(html).toContain('启动 DeepSeek Harness')
    expect(html).toContain('打开日志')
    expect(html).toContain('重新连接')
    expect(html).toContain("case 'loadHarness'")
    expect(html).toContain("case 'runtimeStatus'")
  })
})
