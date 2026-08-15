import { createIdeBridgeScript } from '../src/proxy/ideBridge.js'
import { HarnessProxy } from '../src/proxy/server.js'
import { probeHarness } from '../src/runtime/health.js'
import { HarnessRuntimeManager } from '../src/runtime/manager.js'
import { spawnHarnessProcess } from '../src/runtime/process.js'

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
const proxy = new HarnessProxy({
  bridgeScript: createIdeBridgeScript(),
  log: line => console.error(line),
})

try {
  const upstream = await runtime.start()
  const ready = await proxy.start(upstream.url)
  const authorized = await fetch(ready.entryUrl)
  const html = await authorized.text()
  const unauthorized = await fetch(ready.baseUrl)

  if (!authorized.ok) throw new Error(`Authorized proxy request returned ${authorized.status}`)
  if (unauthorized.status !== 403) throw new Error(`Unauthenticated proxy request returned ${unauthorized.status}`)
  if (!html.includes('dsh-vscode-bridge')) throw new Error('IDE bridge was not injected into official Harness HTML')

  console.log(JSON.stringify({
    upstream: upstream.url,
    proxy: ready.baseUrl,
    authorizedStatus: authorized.status,
    unauthorizedStatus: unauthorized.status,
    bridgeInjected: true,
  }, null, 2))
} finally {
  await proxy.stop()
  await runtime.stop()
}
