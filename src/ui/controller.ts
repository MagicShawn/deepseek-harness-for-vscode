import { randomBytes } from 'node:crypto'
import type { RuntimeStatus, HarnessRuntimeManager } from '../runtime/manager.js'
import type { HarnessProxy, ProxyReady } from '../proxy/server.js'
import { createShellHtml } from './html.js'
import { parseShellMessage, type ShellCommand } from './messages.js'

export interface RuntimeControllerPort {
  readonly status: RuntimeStatus
  onDidChangeStatus(listener: (status: RuntimeStatus) => void): () => void
  start(): ReturnType<HarnessRuntimeManager['start']>
  stop(): ReturnType<HarnessRuntimeManager['stop']>
  restart(): ReturnType<HarnessRuntimeManager['restart']>
}

export interface ProxyControllerPort {
  start(upstream: string): ReturnType<HarnessProxy['start']>
  updateUpstream(upstream: string): void
  stop(): ReturnType<HarnessProxy['stop']>
}

export interface WebviewLike {
  html: string
  postMessage(message: unknown): Thenable<boolean>
  onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void }
}

export interface ShellView {
  webview: WebviewLike
  visible?: boolean
}

export interface UiControllerActions {
  openBrowser(): Promise<void>
  showLogs(): void
  openSettings(): Promise<void>
  openFile(value: string): Promise<void>
  newSession(): Promise<void>
  notifyContextFallback(): Promise<void>
}

export class HarnessUiController {
  private readonly views = new Set<ShellView>()
  private proxyReady: ProxyReady | undefined
  private startPromise: Promise<void> | undefined
  private readonly removeRuntimeListener: () => void

  constructor(
    private readonly runtime: RuntimeControllerPort,
    private readonly proxy: ProxyControllerPort,
    private readonly actions: UiControllerActions,
    private readonly locale: string,
  ) {
    this.removeRuntimeListener = this.runtime.onDidChangeStatus(status => this.broadcast({
      source: 'dsh-vscode-extension',
      type: 'runtimeStatus',
      status,
    }))
  }

  attach(view: ShellView): () => void {
    const nonce = randomBytes(18).toString('base64url')
    view.webview.html = createShellHtml({ nonce, locale: this.locale, initialStatus: this.runtime.status })
    this.views.add(view)
    const receiver = view.webview.onDidReceiveMessage(message => { void this.onMessage(view, message) })
    return () => {
      receiver.dispose()
      this.views.delete(view)
    }
  }

  ensureStarted(): Promise<void> {
    if (this.startPromise !== undefined) return this.startPromise
    const operation = this.startInternal().finally(() => {
      if (this.startPromise === operation) this.startPromise = undefined
    })
    this.startPromise = operation
    return operation
  }

  async restart(): Promise<void> {
    try {
      const ready = await this.runtime.restart()
      await this.loadReady(ready.url)
    } catch {
      // Runtime status carries the actionable diagnostic to every view.
    }
  }

  async stop(): Promise<void> {
    await this.runtime.stop()
  }

  async sendContext(text: string): Promise<boolean> {
    const targets = [...this.views].filter(view => view.visible !== false)
    if (targets.length === 0) return false
    const delivered = await Promise.all(targets.map(view => view.webview.postMessage({
      source: 'dsh-vscode-extension',
      type: 'insertContext',
      text,
    })))
    return delivered.some(Boolean)
  }

  refresh(): void {
    if (this.proxyReady !== undefined) this.broadcastLoad()
  }

  newSession(): void {
    this.broadcast({ source: 'dsh-vscode-extension', type: 'newSession' })
  }

  get upstreamUrl(): string | undefined {
    return this.runtime.status.state === 'ready' ? this.runtime.status.url : undefined
  }

  private async startInternal(): Promise<void> {
    try {
      const ready = await this.runtime.start()
      await this.loadReady(ready.url)
    } catch {
      // Runtime status carries the actionable diagnostic to every view.
    }
  }

  private async loadReady(upstream: string): Promise<void> {
    if (this.proxyReady === undefined) this.proxyReady = await this.proxy.start(upstream)
    else this.proxy.updateUpstream(upstream)
    this.broadcastLoad()
  }

  private broadcastLoad(): void {
    if (this.proxyReady === undefined) return
    this.broadcast({
      source: 'dsh-vscode-extension',
      type: 'loadHarness',
      url: this.proxyReady.entryUrl,
    })
  }

  private async onMessage(view: ShellView, rawMessage: unknown): Promise<void> {
    const message = parseShellMessage(rawMessage)
    if (message === undefined) return
    if (message.type === 'ready') {
      await view.webview.postMessage({
        source: 'dsh-vscode-extension',
        type: 'runtimeStatus',
        status: this.runtime.status,
      })
      if (this.proxyReady !== undefined && this.runtime.status.state === 'ready') {
        await view.webview.postMessage({
          source: 'dsh-vscode-extension',
          type: 'loadHarness',
          url: this.proxyReady.entryUrl,
        })
      } else if (this.runtime.status.state === 'stopped') {
        void this.ensureStarted()
      }
      return
    }
    if (message.type === 'openFile') {
      await this.actions.openFile(message.value)
      return
    }
    if (message.type === 'contextResult') {
      if (!message.ok) await this.actions.notifyContextFallback()
      return
    }
    await this.runCommand(message.command)
  }

  private async runCommand(command: ShellCommand): Promise<void> {
    switch (command) {
      case 'start': await this.ensureStarted(); break
      case 'stop': await this.stop(); break
      case 'restart': await this.restart(); break
      case 'refresh': this.refresh(); break
      case 'openBrowser': await this.actions.openBrowser(); break
      case 'showLogs': this.actions.showLogs(); break
      case 'openSettings': await this.actions.openSettings(); break
      case 'newSession': await this.actions.newSession(); break
    }
  }

  private broadcast(message: unknown): void {
    for (const view of this.views) void view.webview.postMessage(message)
  }

  async dispose(): Promise<void> {
    this.removeRuntimeListener()
    await this.proxy.stop()
    await this.runtime.stop()
    this.views.clear()
  }
}

export function statusLabel(status: RuntimeStatus): string {
  if (status.state === 'ready') return 'DeepSeek Harness: Ready'
  if (status.state === 'starting') return 'DeepSeek Harness: Starting'
  if (status.state === 'error') return `DeepSeek Harness: ${status.message}`
  return 'DeepSeek Harness: Stopped'
}
