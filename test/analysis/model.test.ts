import { describe, expect, test } from 'vitest'

import { analyzeWithModel } from '../../src/analysis/model.js'
import type { NormalizedTrace } from '../../src/shared/types.js'

const trace: NormalizedTrace = {
  cutoffSeq: 4,
  events: [
    { seq: 1, time: 1, type: 'tool/call', summary: 'read_file a' },
    { seq: 2, time: 2, type: 'tool/result', summary: 'file not found', isError: true },
  ],
  invokedSkills: ['demo-skill'],
  truncatedEvents: 0,
  metrics: {
    totalEvents: 2,
    toolCalls: 1,
    toolErrors: 1,
    repeatedToolCalls: 0,
    recoveryAttempts: 0,
  },
}

describe('analyzeWithModel', () => {
  test('parses a fenced JSON response and binds evidence to normalized events', async () => {
    async function* stream() {
      yield { type: 'text-delta' as const, text: '```json\n' }
      yield {
        type: 'text-delta' as const,
        text: JSON.stringify({
          summary: 'The Skill lacks a missing-file recovery step.',
          issues: [
            {
              code: 'missing-file-recovery',
              severity: 'warning',
              title: 'Missing fallback',
              explanation: 'The read failed.',
              recommendation: 'Check the path and search once.',
              evidenceSeqs: [2, 999],
            },
          ],
          revisedSkillContent: '# Demo\n\nCheck paths before reading.',
        }),
      }
      yield { type: 'text-delta' as const, text: '\n```' }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    }

    const output = await analyzeWithModel({
      trace,
      skillName: 'demo-skill',
      skillContent: '# Demo',
      stream,
    })

    expect(output.warning).toBeUndefined()
    expect(output.result?.issues[0]?.source).toBe('model')
    expect(output.result?.issues[0]?.evidence.map((item) => item.seq)).toEqual([2])
    expect(output.result?.revisedSkillContent).toContain('Check paths')
  })

  test('returns a warning instead of throwing on malformed output', async () => {
    async function* stream() {
      yield { type: 'text-delta' as const, text: 'not json' }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    }

    const output = await analyzeWithModel({
      trace,
      skillName: 'demo-skill',
      skillContent: '# Demo',
      stream,
    })

    expect(output.result).toBeNull()
    expect(output.warning).toMatch(/valid JSON/i)
  })
})
