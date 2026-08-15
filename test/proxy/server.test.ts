import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { injectBridge } from '../../src/proxy/bridge.js'
import { HarnessProxy } from '../../src/proxy/server.js'

interface Fixture {
  server: Server
  url: string
}

async function startFixture(): Promise<Fixture> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture')
    if (url.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self'",
      })
      response.end('<!doctype html><html><head><title>Harness</title></head><body>ready</body></html>')
      return
    }
    if (url.pathname === '/asset.js') {
      response.writeHead(200, { 'content-type': 'text/javascript', 'content-length': '20' })
      response.end('window.fixture=true;')
      return
    }
    if (url.pathname === '/echo') {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString('utf8'),
          host: request.headers.host,
          origin: request.headers.origin,
        }))
      })
      return
    }
    if (url.pathname === '/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      })
      response.write('data: first\n\n')
      setTimeout(() => response.end('data: second\n\n'), 5)
      return
    }
    response.writeHead(404)
    response.end('missing')
  })
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, client => {
      client.on('message', data => client.send(data))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture did not bind TCP')
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

describe('injectBridge', () => {
  it('inserts the bridge before head closes and creates a head when absent', () => {
    expect(injectBridge('<html><head><title>x</title></head></html>', '<script>bridge()</script>'))
      .toBe('<html><head><title>x</title><script>bridge()</script></head></html>')
    expect(injectBridge('<html><body>x</body></html>', '<script>bridge()</script>'))
      .toBe('<html><head><script>bridge()</script></head><body>x</body></html>')
  })
})

describe('HarnessProxy', () => {
  let fixture: Fixture
  let proxy: HarnessProxy

  beforeEach(async () => {
    fixture = await startFixture()
    proxy = new HarnessProxy({ bridgeScript: 'window.__DSH_VSCODE_BRIDGE__ = true;' })
  })

  afterEach(async () => {
    await proxy.stop()
    await closeServer(fixture.server)
  })

  it('requires its bootstrap token for the first browser navigation', async () => {
    const ready = await proxy.start(fixture.url)
    expect((await fetch(ready.baseUrl)).status).toBe(403)
    const response = await fetch(ready.entryUrl)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('window.__DSH_VSCODE_BRIDGE__ = true;')
  })

  it('strips frame-blocking headers and repairs content length after HTML injection', async () => {
    const ready = await proxy.start(fixture.url)
    const response = await fetch(ready.entryUrl)
    const text = await response.text()
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength(text)))
  })

  it('streams static assets and allows same-origin requests from the embedded page', async () => {
    const ready = await proxy.start(fixture.url)
    const response = await fetch(new URL('/asset.js', ready.baseUrl), {
      headers: { referer: ready.entryUrl },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('window.fixture=true;')
  })

  it('forwards POST bodies while rewriting host and origin to the Harness upstream', async () => {
    const ready = await proxy.start(fixture.url)
    const response = await fetch(new URL('/echo', ready.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        origin: ready.baseUrl.slice(0, -1),
      },
      body: 'hello',
    })
    expect(await response.json()).toEqual({
      method: 'POST',
      body: 'hello',
      host: new URL(fixture.url).host,
      origin: fixture.url.slice(0, -1),
    })
  })

  it('does not buffer an SSE response before forwarding it', async () => {
    const ready = await proxy.start(fixture.url)
    const response = await fetch(new URL('/events', ready.baseUrl), {
      headers: { referer: ready.entryUrl },
    })
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    const first = await reader?.read()
    expect(new TextDecoder().decode(first?.value)).toContain('data: first')
    const second = await reader?.read()
    expect(new TextDecoder().decode(second?.value)).toContain('data: second')
  })

  it('tunnels WebSocket upgrades with same-origin validation', async () => {
    const ready = await proxy.start(fixture.url)
    const socketUrl = ready.baseUrl.replace(/^http/u, 'ws')
    const socket = new WebSocket(socketUrl, { origin: ready.baseUrl.slice(0, -1) })
    await once(socket, 'open')
    socket.send('ping')
    const [message] = await once(socket, 'message')
    expect(message.toString()).toBe('ping')
    socket.close()
    await once(socket, 'close')
  })

  it('returns 502 while its upstream is unavailable and can switch upstreams', async () => {
    const ready = await proxy.start('http://127.0.0.1:9/')
    expect((await fetch(ready.entryUrl)).status).toBe(502)
    proxy.updateUpstream(fixture.url)
    expect((await fetch(ready.entryUrl)).status).toBe(200)
  })
})
