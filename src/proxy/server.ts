import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import { injectBridge } from './bridge.js'

const TOKEN_PARAM = '__dsh_vscode_token'
const FRAME_HEADERS = new Set(['content-security-policy', 'content-security-policy-report-only', 'x-frame-options'])

export interface ProxyReady {
  baseUrl: string
  entryUrl: string
}

export interface HarnessProxyOptions {
  bridgeScript: string
  log?: (line: string) => void
}

function sameSecret(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export class HarnessProxy {
  private readonly token = randomBytes(32).toString('base64url')
  private readonly webSockets = new Set<WebSocket>()
  private server: Server | undefined
  private ready: ProxyReady | undefined
  private upstream: URL | undefined

  constructor(private readonly options: HarnessProxyOptions) {}

  async start(upstream: string): Promise<ProxyReady> {
    this.updateUpstream(upstream)
    if (this.ready !== undefined) return this.ready

    const server = createServer((request, response) => {
      void this.forwardHttp(request, response).catch(error => {
        this.options.log?.(`[Proxy] ${error instanceof Error ? error.message : String(error)}`)
        if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('DeepSeek Harness upstream is unavailable.')
      })
    })
    server.on('upgrade', (request, socket, head) => this.forwardUpgrade(request, socket, head))
    server.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    this.server = server
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Harness proxy did not bind TCP')
    const baseUrl = `http://127.0.0.1:${address.port}/`
    this.ready = {
      baseUrl,
      entryUrl: `${baseUrl}?${TOKEN_PARAM}=${encodeURIComponent(this.token)}`,
    }
    return this.ready
  }

  updateUpstream(upstream: string): void {
    const parsed = new URL(upstream)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Harness proxy upstream must use HTTP or HTTPS')
    }
    if (parsed.username !== '' || parsed.password !== '') {
      throw new Error('Harness proxy upstream must not contain URL credentials')
    }
    this.upstream = parsed
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.ready = undefined
    for (const socket of this.webSockets) socket.terminate()
    this.webSockets.clear()
    if (server === undefined) return
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  private isAuthorized(request: IncomingMessage, requestUrl: URL): boolean {
    const candidate = requestUrl.searchParams.get(TOKEN_PARAM)
    if (candidate !== null && sameSecret(candidate, this.token)) return true
    if (this.ready === undefined) return false
    const proxyOrigin = new URL(this.ready.baseUrl).origin
    const origin = headerString(request.headers.origin)
    if (origin !== undefined) return origin === proxyOrigin
    const referer = headerString(request.headers.referer)
    if (referer === undefined) return false
    try {
      return new URL(referer).origin === proxyOrigin
    } catch {
      return false
    }
  }

  private targetFor(requestUrl: URL): URL {
    if (this.upstream === undefined) throw new Error('Harness proxy has no upstream')
    const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, this.upstream)
    target.searchParams.delete(TOKEN_PARAM)
    return target
  }

  private async forwardHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const localUrl = new URL(request.url ?? '/', this.ready?.baseUrl ?? 'http://127.0.0.1/')
    if (!this.isAuthorized(request, localUrl)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Forbidden')
      return
    }
    const target = this.targetFor(localUrl)
    const headers = { ...request.headers }
    headers.host = target.host
    headers['accept-encoding'] = 'identity'
    delete headers['content-length']
    if (headers.origin !== undefined) headers.origin = target.origin
    if (headers.referer !== undefined) headers.referer = new URL('/', target).href

    await new Promise<void>((resolve, reject) => {
      const requester = target.protocol === 'https:' ? httpsRequest : httpRequest
      const upstreamRequest = requester(target, {
        method: request.method,
        headers,
      }, upstreamResponse => {
        const contentType = headerString(upstreamResponse.headers['content-type']) ?? ''
        const html = /\btext\/html\b/iu.test(contentType)
        const responseHeaders: Record<string, string | string[]> = {}
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (value === undefined) continue
          if (html && (
            FRAME_HEADERS.has(name)
            || name === 'content-length'
            || name === 'content-encoding'
            || name === 'transfer-encoding'
          )) continue
          responseHeaders[name] = value
        }

        if (!html) {
          response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders)
          upstreamResponse.pipe(response)
          upstreamResponse.once('end', resolve)
          upstreamResponse.once('error', reject)
          return
        }

        const chunks: Buffer[] = []
        upstreamResponse.on('data', chunk => chunks.push(Buffer.from(chunk)))
        upstreamResponse.once('error', reject)
        upstreamResponse.once('end', () => {
          const tag = `<script>${this.options.bridgeScript}</script>`
          const body = Buffer.from(injectBridge(Buffer.concat(chunks).toString('utf8'), tag))
          responseHeaders['content-length'] = String(body.byteLength)
          response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders)
          response.end(body)
          resolve()
        })
      })
      upstreamRequest.once('error', reject)
      request.once('error', reject)
      request.pipe(upstreamRequest)
    })
  }

  private forwardUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const localUrl = new URL(request.url ?? '/', this.ready?.baseUrl ?? 'http://127.0.0.1/')
    if (!this.isAuthorized(request, localUrl)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    let target: URL
    try {
      target = this.targetFor(localUrl)
    } catch {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
      return
    }
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'

    const downstreamServer = new WebSocketServer({ noServer: true })
    downstreamServer.handleUpgrade(request, socket, head, downstream => {
      downstreamServer.close()
      this.webSockets.add(downstream)
      downstream.once('close', () => this.webSockets.delete(downstream))

      const upstream = new WebSocket(target, {
        headers: {
          host: target.host,
          origin: this.upstream?.origin ?? target.origin,
        },
      })
      this.webSockets.add(upstream)
      upstream.once('close', () => this.webSockets.delete(upstream))
      const queued: Array<{ data: Buffer; binary: boolean }> = []

      downstream.on('message', (data, binary) => {
        const payload = Buffer.from(data as ArrayBuffer)
        if (upstream.readyState === WebSocket.OPEN) upstream.send(payload, { binary })
        else if (upstream.readyState === WebSocket.CONNECTING) queued.push({ data: payload, binary })
      })
      upstream.once('open', () => {
        for (const item of queued) upstream.send(item.data, { binary: item.binary })
        queued.length = 0
      })
      upstream.on('message', (data, binary) => {
        if (downstream.readyState === WebSocket.OPEN) downstream.send(data, { binary })
      })
      upstream.once('error', () => downstream.close(1011, 'Harness upstream unavailable'))
      downstream.once('error', () => upstream.terminate())
      downstream.once('close', () => upstream.close())
      upstream.once('close', () => downstream.close())
    })
  }
}
