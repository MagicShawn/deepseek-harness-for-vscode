export type ConnectionMode = 'auto' | 'managed' | 'external'
export type RuntimePlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'

export interface LaunchConfig {
  mode: ConnectionMode
  externalUrl: string
  command?: string
  port: number
}

export type LaunchPlan =
  | { kind: 'external'; url: string }
  | { kind: 'managed'; command: string; args: string[] }

export function parseCommandLine(value: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | undefined
  let escaped = false
  let started = false

  const input = value.trim()
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === undefined) continue
    if (escaped) {
      token += char
      escaped = false
      started = true
      continue
    }
    if (char === '\\' && quote === '"') {
      const next = input[index + 1]
      if (next === '"' || next === '\\') {
        escaped = true
        continue
      }
      token += char
      started = true
      continue
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      else token += char
      started = true
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/u.test(char)) {
      if (started) {
        tokens.push(token)
        token = ''
        started = false
      }
      continue
    }
    token += char
    started = true
  }

  if (escaped || quote !== undefined) throw new Error('Custom command contains an unclosed quote or escape')
  if (started) tokens.push(token)
  if (tokens.length === 0) throw new Error('Custom command cannot be empty')
  return tokens
}

function normalizeExternalUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('deepseekHarness.externalUrl must be a valid HTTP URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('deepseekHarness.externalUrl must use HTTP or HTTPS')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('deepseekHarness.externalUrl must not contain credentials')
  }
  return url.href
}

export function resolveLaunchPlan(config: LaunchConfig, dshCommand: string | undefined, platform: RuntimePlatform): LaunchPlan {
  if (config.mode !== 'managed' && config.externalUrl.trim() !== '') {
    return { kind: 'external', url: normalizeExternalUrl(config.externalUrl.trim()) }
  }
  if (config.mode === 'external') {
    throw new Error('deepseekHarness.externalUrl is required in external mode')
  }

  const webArgs = ['web', '--host', '127.0.0.1', '--port', String(config.port)]
  if (config.command?.trim()) {
    const [command, ...prefixArgs] = parseCommandLine(config.command)
    if (command === undefined) throw new Error('Custom command cannot be empty')
    return { kind: 'managed', command, args: [...prefixArgs, ...webArgs] }
  }
  if (dshCommand !== undefined) return { kind: 'managed', command: dshCommand, args: webArgs }
  return {
    kind: 'managed',
    command: platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['--yes', '@deepseek-ai/dsh', ...webArgs],
  }
}
