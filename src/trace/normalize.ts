import type {
  NormalizedEvent,
  NormalizedTrace,
  TraceMetrics,
} from '../shared/types.js'

export interface TraceEventInput {
  seq: number
  time: number
  type: string
  data: unknown
}

export interface NormalizeOptions {
  maxEvents?: number
  maxStringLength?: number
}

const DEFAULT_MAX_EVENTS = 2_000
const DEFAULT_MAX_STRING_LENGTH = 1_200

const SECRET_KEY = /(?:api[_-]?key|authorization|password|secret|token)/i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BEARER = /\bBearer\s+[A-Z0-9._~+/=-]+/gi
const DEEPSEEK_KEY = /\bsk-[A-Z0-9_-]{6,}\b/gi
const KEY_VALUE = /\b(api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/gi
const WINDOWS_HOME = /\b[A-Z]:\\Users\\[^\\\s]+/gi
const UNIX_HOME = /\/(?:Users|home)\/[^/\s]+/g

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  if (limit <= 1) return '…'.slice(0, limit)
  return `${value.slice(0, limit - 1)}…`
}

export function redactText(value: string): string {
  return value
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(DEEPSEEK_KEY, '[REDACTED_SECRET]')
    .replace(KEY_VALUE, '$1=[REDACTED]')
    .replace(WINDOWS_HOME, 'C:\\Users\\[USER]')
    .replace(UNIX_HOME, '/home/[USER]')
}

function sanitize(value: unknown, limit: number, key = ''): unknown {
  if (SECRET_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return truncate(redactText(value), limit)
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, limit))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 60)
        .map(([childKey, childValue]) => [childKey, sanitize(childValue, limit, childKey)]),
    )
  }
  return value
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((block) => {
      const item = record(block)
      if (typeof item.text === 'string') return item.text
      if (typeof item.delta === 'string') return item.delta
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

function eventSummary(type: string, data: Record<string, unknown>): string {
  if (type === 'tool/call') {
    return `${String(data.name ?? 'tool')} ${String(data.arguments ?? '')}`.trim()
  }

  if (type === 'tool/result') {
    const message = record(data.message)
    return textFromContent(message.content) || JSON.stringify(sanitize(message, DEFAULT_MAX_STRING_LENGTH))
  }

  if (type === 'user/message') {
    return textFromContent(data.content) || JSON.stringify(sanitize(data, DEFAULT_MAX_STRING_LENGTH))
  }

  if (type === 'assistant/message') {
    const message = record(data.message)
    return textFromContent(message.content) || JSON.stringify(sanitize(message, DEFAULT_MAX_STRING_LENGTH))
  }

  if (type === 'assistant/chunk') {
    const chunk = record(data.chunk)
    return typeof chunk.delta === 'string'
      ? chunk.delta
      : JSON.stringify(sanitize(chunk, DEFAULT_MAX_STRING_LENGTH))
  }

  return JSON.stringify(sanitize(data, DEFAULT_MAX_STRING_LENGTH))
}

function parseSkillName(name: unknown, argumentsValue: unknown): string | undefined {
  if (name !== 'skill' || typeof argumentsValue !== 'string') return undefined
  try {
    const parsed = record(JSON.parse(argumentsValue))
    return typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : undefined
  } catch {
    return undefined
  }
}

function normalizeEvent(event: TraceEventInput, stringLimit: number): NormalizedEvent {
  const rawData = record(event.data)
  const safeData = record(sanitize(rawData, stringLimit))
  const summary = truncate(redactText(eventSummary(event.type, safeData)), stringLimit)
  const normalized: NormalizedEvent = {
    seq: event.seq,
    time: event.time,
    type: event.type,
    summary,
  }

  if (event.type === 'tool/call') {
    normalized.toolName = String(safeData.name ?? 'unknown')
    normalized.toolArguments = truncate(String(safeData.arguments ?? ''), stringLimit)
    const skillName = parseSkillName(rawData.name, rawData.arguments)
    if (skillName) normalized.skillName = redactText(skillName)
  }

  if (event.type === 'tool/result') {
    const message = record(rawData.message)
    normalized.isError = Boolean(rawData.error) || message.isError === true
  }

  if (event.type === 'user/message') {
    const source = record(rawData.source)
    if (source.kind === 'skill-invocation' && typeof source.name === 'string') {
      normalized.skillName = redactText(source.name)
    }
  }

  return normalized
}

function computeMetrics(events: readonly NormalizedEvent[]): TraceMetrics {
  const calls = events.filter((event) => event.type === 'tool/call')
  const errors = events.filter((event) => event.type === 'tool/result' && event.isError)
  const seenCalls = new Set<string>()
  let repeatedToolCalls = 0

  for (const call of calls) {
    const signature = `${call.toolName ?? ''}\n${call.toolArguments ?? ''}`
    if (seenCalls.has(signature)) repeatedToolCalls += 1
    seenCalls.add(signature)
  }

  let recoveryAttempts = 0
  for (const error of errors) {
    if (
      events.some(
        (event) =>
          event.seq > error.seq &&
          event.seq <= error.seq + 3 &&
          event.type === 'tool/call' &&
          event.toolName !== 'skill',
      )
    ) {
      recoveryAttempts += 1
    }
  }

  return {
    totalEvents: events.length,
    toolCalls: calls.length,
    toolErrors: errors.length,
    repeatedToolCalls,
    recoveryAttempts,
  }
}

export function normalizeTrace(
  input: readonly TraceEventInput[],
  options: NormalizeOptions = {},
): NormalizedTrace {
  const maxEvents = Math.max(1, options.maxEvents ?? DEFAULT_MAX_EVENTS)
  const maxStringLength = Math.max(1, options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH)
  const eligible = input.filter(
    (event) =>
      !event.type.startsWith('command/'),
  )
  const selected = eligible.slice(-maxEvents)
  const events = selected.map((event) => normalizeEvent(event, maxStringLength))
  const invokedSkills = [
    ...new Set(
      events
        .map((event) => event.skillName)
        .filter((name): name is string => Boolean(name)),
    ),
  ]

  return {
    cutoffSeq: input.length === 0 ? 0 : Math.max(...input.map((event) => event.seq)) + 1,
    events,
    invokedSkills,
    truncatedEvents: Math.max(0, eligible.length - selected.length),
    metrics: computeMetrics(events),
  }
}
