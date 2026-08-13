import { createServer } from 'node:http'
import { createIdeBridgeScript } from '../src/proxy/ideBridge.js'
import { HarnessProxy } from '../src/proxy/server.js'
import { probeHarness } from '../src/runtime/health.js'
import { HarnessRuntimeManager } from '../src/runtime/manager.js'
import { spawnHarnessProcess } from '../src/runtime/process.js'
import { createShellHtml } from '../src/ui/html.js'

const runtime = new HarnessRuntimeManager({
  config: { mode: 'managed', externalUrl: '', port: 0 },
  cwd: process.cwd(),
  platform: process.platform,
  dshCommand: undefined,
  startupTimeoutMs: 120_000,
  spawn: spawnHarnessProcess,
  probe: probeHarness,
  log: line => console.error(line),
})
const proxy = new HarnessProxy({ bridgeScript: createIdeBridgeScript(), log: line => console.error(line) })
const upstream = await runtime.start()
const proxyReady = await proxy.start(upstream.url)
const nonce = 'preview-nonce'
const baseHtml = createShellHtml({
  nonce,
  locale: 'zh-CN',
  initialStatus: { state: 'ready', url: upstream.url, managed: true },
})
const mock = `<script nonce="${nonce}">
window.acquireVsCodeApi = () => ({
  postMessage(message) {
    if (message?.type === 'ready') setTimeout(() => window.postMessage({
      source: 'dsh-vscode-extension', type: 'loadHarness', url: ${JSON.stringify(proxyReady.entryUrl)}
    }, '*'), 0);
  }
});
</script>`
const theme = `<style nonce="${nonce}">:root {
  --vscode-foreground: #cccccc; --vscode-descriptionForeground: #9d9d9d;
  --vscode-sideBar-background: #181818; --vscode-editor-background: #1f1f1f;
  --vscode-panel-border: #2b2b2b; --vscode-textLink-foreground: #4daafc;
  --vscode-toolbar-hoverBackground: #2a2d2e; --vscode-focusBorder: #007fd4;
  --vscode-button-foreground: #fff; --vscode-button-background: #0e639c;
  --vscode-button-hoverBackground: #1177bb; --vscode-button-secondaryForeground: #fff;
  --vscode-button-secondaryBackground: #3a3d41;
}</style>`
const html = baseHtml
  .replace('</head>', `${theme}</head>`)
  .replace(`<script nonce="${nonce}">`, `${mock}<script nonce="${nonce}">`)

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(html)
})
server.listen(0, '127.0.0.1')
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve)
  server.once('error', reject)
})
const address = server.address()
if (address === null || typeof address === 'string') throw new Error('Preview did not bind TCP')
console.log(`preview: http://127.0.0.1:${address.port}/`)

async function close(): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await proxy.stop()
  await runtime.stop()
}

process.once('SIGINT', () => { void close().finally(() => process.exit(0)) })
process.once('SIGTERM', () => { void close().finally(() => process.exit(0)) })
await new Promise(() => undefined)
