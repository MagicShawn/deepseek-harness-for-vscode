import { describe, expect, test } from 'vitest'

import { analyzeWithRules } from '../../src/trace/rules.js'
import type { NormalizedTrace } from '../../src/shared/types.js'

function trace(overrides: Partial<NormalizedTrace> = {}): NormalizedTrace {
  return {
    cutoffSeq: 10,
    events: [],
    invokedSkills: [],
    truncatedEvents: 0,
    metrics: {
      totalEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      repeatedToolCalls: 0,
      recoveryAttempts: 0,
    },
    ...overrides,
  }
}

describe('analyzeWithRules', () => {
  test('finds repeated calls, tool failures, missing recovery, and late skill use', () => {
    const result = analyzeWithRules(
      trace({
        cutoffSeq: 12,
        invokedSkills: ['demo-skill'],
        events: [
          { seq: 7, time: 7, type: 'tool/call', summary: 'read_file {"path":"a"}', toolName: 'read_file', toolArguments: '{"path":"a"}' },
          { seq: 8, time: 8, type: 'tool/call', summary: 'read_file {"path":"a"}', toolName: 'read_file', toolArguments: '{"path":"a"}' },
          { seq: 9, time: 9, type: 'tool/result', summary: 'failed to read', isError: true },
          { seq: 10, time: 10, type: 'tool/call', summary: 'skill demo-skill', toolName: 'skill', toolArguments: '{"name":"demo-skill"}', skillName: 'demo-skill' },
        ],
        metrics: {
          totalEvents: 4,
          toolCalls: 3,
          toolErrors: 1,
          repeatedToolCalls: 1,
          recoveryAttempts: 0,
        },
      }),
      { selectedSkill: 'demo-skill' },
    )

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'repeated-tool-call',
        'tool-error',
        'missing-recovery',
        'late-skill-invocation',
      ]),
    )
    expect(result.issues.every((issue) => issue.evidence.length > 0)).toBe(true)
  })

  test('reports when the selected skill never appeared in the trace', () => {
    const result = analyzeWithRules(trace(), { selectedSkill: 'missing-skill' })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('skill-not-invoked')
    expect(result.issues[0]?.severity).toBe('warning')
  })
})
