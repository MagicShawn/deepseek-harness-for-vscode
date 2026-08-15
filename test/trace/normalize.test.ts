import { describe, expect, test } from 'vitest'

import { normalizeTrace } from '../../src/trace/normalize.js'

describe('normalizeTrace', () => {
  test('extracts skill invocations and redacts secrets and local paths', () => {
    const trace = normalizeTrace([
      {
        seq: 0,
        time: 1_700_000_000_000,
        type: 'user/message',
        data: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Email me at dev@example.com from C:\\Users\\alice\\repo. API_KEY=sk-secret123',
            },
          ],
        },
      },
      {
        seq: 1,
        time: 1_700_000_000_100,
        type: 'tool/call',
        data: {
          turn: 0,
          step: 0,
          callId: 'call-1',
          name: 'skill',
          arguments: '{"name":"demo-skill"}',
        },
      },
      {
        seq: 2,
        time: 1_700_000_000_200,
        type: 'tool/result',
        data: {
          turn: 0,
          step: 0,
          message: {
            role: 'tool',
            callId: 'call-1',
            content: [{ type: 'text', text: 'Bearer token-value' }],
            isError: true,
          },
        },
      },
    ])

    expect(trace.invokedSkills).toEqual(['demo-skill'])
    expect(trace.events).toHaveLength(3)
    expect(JSON.stringify(trace.events)).not.toContain('dev@example.com')
    expect(JSON.stringify(trace.events)).not.toContain('alice')
    expect(JSON.stringify(trace.events)).not.toContain('sk-secret123')
    expect(JSON.stringify(trace.events)).not.toContain('token-value')
    expect(JSON.stringify(trace.events)).toContain('[REDACTED_EMAIL]')
    expect(trace.metrics.toolCalls).toBe(1)
    expect(trace.metrics.toolErrors).toBe(1)
  })

  test('keeps the most recent bounded event window and truncates large values', () => {
    const events = Array.from({ length: 5 }, (_, seq) => ({
      seq,
      time: seq,
      type: 'assistant/chunk',
      data: { chunk: { type: 'text-delta', delta: `event-${seq}-${'x'.repeat(100)}` } },
    }))

    const trace = normalizeTrace(events, { maxEvents: 3, maxStringLength: 24 })

    expect(trace.events.map((event) => event.seq)).toEqual([2, 3, 4])
    expect(trace.truncatedEvents).toBe(2)
    expect(trace.events.every((event) => event.summary.length <= 25)).toBe(true)
  })
})
