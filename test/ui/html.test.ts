import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
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

  it('delegates clipboard writes to the embedded Harness UI without granting clipboard reads', () => {
    const html = createShellHtml({
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      initialStatus: { state: 'stopped' },
    })
    const dom = new JSDOM(html)
    const permissions = dom.window.document.querySelector('iframe')
      ?.getAttribute('allow')
      ?.split(';')
      .map(value => value.trim()) ?? []

    expect(permissions).toContain('clipboard-write')
    expect(permissions).not.toContain('clipboard-read')
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
    expect(html).toContain('刷新页面')
    expect(html).toContain('更多操作')
    expect(html).toContain("case 'loadHarness'")
    expect(html).toContain("case 'runtimeStatus'")
  })

  it('accepts extension-host messages whose browser source is not the webview window', () => {
    const html = createShellHtml({
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      initialStatus: { state: 'stopped' },
    })
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/',
      beforeParse(window) {
        Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: () => undefined }) })
      },
    })
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: null,
      data: {
        source: 'dsh-vscode-extension',
        type: 'loadHarness',
        url: 'http://127.0.0.1:4100/?token=secret',
      },
    }))
    const frame = dom.window.document.querySelector('iframe')
    expect(frame?.src).toBe('http://127.0.0.1:4100/?token=secret')
    expect(frame?.hidden).toBe(false)
  })

  it('queues context until the injected iframe bridge reports ready', () => {
    const html = createShellHtml({
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      initialStatus: { state: 'ready', url: 'http://127.0.0.1:3080/', managed: true },
    })
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://webview.local/',
      beforeParse(window) {
        Object.assign(window, { acquireVsCodeApi: () => ({ postMessage: () => undefined }) })
      },
    })
    const frame = dom.window.document.querySelector('iframe')
    const posted: unknown[] = []
    if (frame?.contentWindow !== null && frame?.contentWindow !== undefined) {
      frame.contentWindow.postMessage = (message: unknown) => { posted.push(message) }
    }
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: null,
      data: { source: 'dsh-vscode-extension', type: 'insertContext', text: 'selection' },
    }))
    expect(posted).toEqual([])

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: frame?.contentWindow ?? null,
      data: { source: 'dsh-vscode-bridge', type: 'ready' },
    }))
    expect(posted).toContainEqual({ source: 'dsh-vscode-shell', type: 'insertContext', text: 'selection' })
  })
})
