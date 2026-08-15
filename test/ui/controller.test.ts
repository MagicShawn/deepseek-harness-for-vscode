import { describe, expect, it, vi } from 'vitest'
import type { RuntimeReady, RuntimeStatus } from '../../src/runtime/manager.js'
import { HarnessUiController, type ShellView, type UiControllerActions } from '../../src/ui/controller.js'

class FakeRuntime {
  status: RuntimeStatus = { state: 'stopped' }
  starts = 0
  stops = 0
  restarts = 0
  private listener: ((status: RuntimeStatus) => void) | undefined

  onDidChangeStatus(listener: (status: RuntimeStatus) => void): () => void {
    this.listener = listener
    return () => { this.listener = undefined }
  }

  async start(): Promise<RuntimeReady> {
    this.starts += 1
    this.set({ state: 'ready', url: 'http://127.0.0.1:3080/', managed: true })
    return { url: 'http://127.0.0.1:3080/', managed: true }
  }

  async stop(): Promise<void> {
    this.stops += 1
    this.set({ state: 'stopped' })
  }

  async restart(): Promise<RuntimeReady> {
    this.restarts += 1
    this.set({ state: 'ready', url: 'http://127.0.0.1:3081/', managed: true })
    return { url: 'http://127.0.0.1:3081/', managed: true }
  }

  private set(status: RuntimeStatus): void {
    this.status = status
    this.listener?.(status)
  }
}

class FakeProxy {
  upstreams: string[] = []
  starts = 0
  stops = 0

  async start(upstream: string): Promise<{ baseUrl: string; entryUrl: string }> {
    this.starts += 1
    this.upstreams.push(upstream)
    return {
      baseUrl: 'http://127.0.0.1:4100/',
      entryUrl: 'http://127.0.0.1:4100/?token=secret',
    }
  }

  updateUpstream(upstream: string): void {
    this.upstreams.push(upstream)
  }

  async stop(): Promise<void> { this.stops += 1 }
}

function view(visible = true, acceptsMessages = true): ShellView & { messages: unknown[]; receive(message: unknown): void } {
  const messages: unknown[] = []
  let receiver: ((message: unknown) => void) | undefined
  return {
    visible,
    messages,
    webview: {
      html: '',
      postMessage: async message => { messages.push(message); return acceptsMessages },
      onDidReceiveMessage: listener => {
        receiver = listener
        return { dispose: () => { receiver = undefined } }
      },
    },
    receive: message => receiver?.(message),
  }
}

function setup(): {
  controller: HarnessUiController
  runtime: FakeRuntime
  proxy: FakeProxy
  actions: UiControllerActions
} {
  const runtime = new FakeRuntime()
  const proxy = new FakeProxy()
  const actions: UiControllerActions = {
    openBrowser: vi.fn(async () => {}),
    showLogs: vi.fn(),
    openSettings: vi.fn(async () => {}),
    openFile: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    notifyContextFallback: vi.fn(async () => {}),
  }
  return {
    controller: new HarnessUiController(runtime, proxy, actions, 'zh-cn'),
    runtime,
    proxy,
    actions,
  }
}

describe('HarnessUiController', () => {
  it('auto-starts once when multiple newly attached views become ready', async () => {
    const fixture = setup()
    const first = view()
    const second = view()
    fixture.controller.attach(first)
    fixture.controller.attach(second)
    first.receive({ type: 'ready' })
    second.receive({ type: 'ready' })

    await vi.waitFor(() => expect(fixture.runtime.starts).toBe(1))
    expect(fixture.proxy.starts).toBe(1)
    expect(first.messages).toContainEqual(expect.objectContaining({ type: 'loadHarness' }))
    expect(second.messages).toContainEqual(expect.objectContaining({ type: 'loadHarness' }))
  })

  it('sends editor context only to visible views', async () => {
    const fixture = setup()
    const shown = view(true)
    const hidden = view(false)
    fixture.controller.attach(shown)
    fixture.controller.attach(hidden)

    await expect(fixture.controller.sendContext('selected code')).resolves.toBe(true)
    expect(shown.messages).toContainEqual(expect.objectContaining({ type: 'insertContext', text: 'selected code' }))
    expect(hidden.messages).not.toContainEqual(expect.objectContaining({ type: 'insertContext' }))
  })

  it('reports context delivery failure when every visible webview rejects the message', async () => {
    const fixture = setup()
    fixture.controller.attach(view(true, false))
    await expect(fixture.controller.sendContext('selected code')).resolves.toBe(false)
  })

  it('routes validated file and command messages but ignores arbitrary commands', async () => {
    const fixture = setup()
    const shell = view()
    fixture.controller.attach(shell)
    shell.receive({ type: 'openFile', value: 'src/app.ts:3' })
    shell.receive({ type: 'command', command: 'showLogs' })
    shell.receive({ type: 'command', command: 'workbench.action.deleteFile' })

    await vi.waitFor(() => expect(fixture.actions.openFile).toHaveBeenCalledWith('src/app.ts:3'))
    expect(fixture.actions.showLogs).toHaveBeenCalledOnce()
  })

  it('updates the existing proxy upstream during restart instead of binding another proxy', async () => {
    const fixture = setup()
    await fixture.controller.ensureStarted()
    await fixture.controller.restart()
    expect(fixture.proxy.starts).toBe(1)
    expect(fixture.proxy.upstreams).toEqual([
      'http://127.0.0.1:3080/',
      'http://127.0.0.1:3081/',
    ])
  })

  it('absorbs a restart failure after the runtime publishes its diagnostic status', async () => {
    const fixture = setup()
    fixture.runtime.restart = vi.fn(async () => { throw new Error('restart failed') })
    await expect(fixture.controller.restart()).resolves.toBeUndefined()
  })

  it('disposes both proxy and owned runtime', async () => {
    const fixture = setup()
    await fixture.controller.dispose()
    expect(fixture.proxy.stops).toBe(1)
    expect(fixture.runtime.stops).toBe(1)
  })
})
