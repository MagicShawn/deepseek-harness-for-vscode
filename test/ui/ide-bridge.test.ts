import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'
import { createIdeBridgeScript } from '../../src/proxy/ideBridge.js'

function runBridge(html: string): { dom: JSDOM; posted: unknown[] } {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://127.0.0.1:3000/' })
  const posted: unknown[] = []
  dom.window.postMessage = vi.fn((message: unknown) => { posted.push(message) }) as typeof dom.window.postMessage
  dom.window.eval(createIdeBridgeScript())
  return { dom, posted }
}

describe('createIdeBridgeScript', () => {
  it('inserts context through the native textarea value setter and dispatches input', () => {
    const { dom, posted } = runBridge('<textarea>existing</textarea>')
    const textarea = dom.window.document.querySelector('textarea')
    let inputEvents = 0
    textarea?.addEventListener('input', () => { inputEvents += 1 })

    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: dom.window as unknown as Window,
      data: { source: 'dsh-vscode-shell', type: 'insertContext', text: 'selection' },
    }))

    expect(textarea?.value).toBe('existing\n\nselection')
    expect(inputEvents).toBe(1)
    expect(posted).toContainEqual({ source: 'dsh-vscode-bridge', type: 'contextResult', ok: true })
  })

  it('reports a non-destructive failure when the composer is not mounted', () => {
    const { dom, posted } = runBridge('<main>conversation</main>')
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: dom.window as unknown as Window,
      data: { source: 'dsh-vscode-shell', type: 'insertContext', text: 'selection' },
    }))
    expect(posted).toContainEqual({ source: 'dsh-vscode-bridge', type: 'contextResult', ok: false })
  })

  it('intercepts file links but leaves web links inside Harness', () => {
    const { dom, posted } = runBridge(`
      <a id="file" href="file:///D:/repo/src/app.ts#L7:2">app</a>
      <a id="web" href="https://example.com">web</a>
    `)
    const fileEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
    dom.window.document.querySelector('#file')?.dispatchEvent(fileEvent)
    let webWasPrevented = true
    dom.window.document.querySelector('#web')?.addEventListener('click', event => {
      webWasPrevented = event.defaultPrevented
      event.preventDefault()
    })
    const webEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
    dom.window.document.querySelector('#web')?.dispatchEvent(webEvent)

    expect(fileEvent.defaultPrevented).toBe(true)
    expect(webWasPrevented).toBe(false)
    expect(posted).toContainEqual({
      source: 'dsh-vscode-bridge',
      type: 'openFile',
      value: 'file:///D:/repo/src/app.ts#L7:2',
    })
  })
})
