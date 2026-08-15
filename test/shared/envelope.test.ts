import { describe, expect, test } from 'vitest'

import {
  analysisIdForCommandId,
  decodeInsightCommandResult,
  encodeInsightCommandResult,
} from '../../src/shared/envelope.js'

describe('Skill Insight command result envelope', () => {
  test('uses a deterministic filesystem-safe analysis id', () => {
    const first = analysisIdForCommandId('cmd:one/with spaces')
    expect(first).toBe(analysisIdForCommandId('cmd:one/with spaces'))
    expect(first).toMatch(/^si-[a-z0-9]+-[a-zA-Z0-9._-]+$/)
  })

  test('round-trips a versioned result and ignores normal command text', () => {
    const value = {
      schemaVersion: 1 as const,
      type: 'failed' as const,
      analysisId: 'si-test',
      operation: 'analyze' as const,
      message: 'No Skill invocation was detected.',
    }
    expect(decodeInsightCommandResult(encodeInsightCommandResult(value))).toEqual(value)
    expect(decodeInsightCommandResult('ordinary command output')).toBeNull()
    expect(decodeInsightCommandResult('[[skill-insight:v1]]not-json')).toBeNull()
  })
})
