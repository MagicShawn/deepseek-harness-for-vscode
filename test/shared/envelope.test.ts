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

  test('round-trips analysis- and session-scoped cleanup results', () => {
    const analysisResult = {
      schemaVersion: 1 as const,
      type: 'cleared' as const,
      analysisId: 'si-clear-command',
      scope: 'analysis' as const,
      clearedAnalysisIds: ['si-target'],
      message: 'Cleared one analysis.',
    }
    const sessionResult = {
      schemaVersion: 1 as const,
      type: 'cleared' as const,
      analysisId: 'si-clear-all-command',
      scope: 'session' as const,
      clearedAnalysisIds: ['si-one', 'si-two'],
      message: 'Cleared two analyses.',
    }

    expect(decodeInsightCommandResult(encodeInsightCommandResult(analysisResult))).toEqual(analysisResult)
    expect(decodeInsightCommandResult(encodeInsightCommandResult(sessionResult))).toEqual(sessionResult)
  })

  test('rejects malformed cleanup results', () => {
    const malformed = [
      {
        schemaVersion: 1,
        type: 'cleared',
        analysisId: 'si-clear',
        scope: 'analysis',
        clearedAnalysisIds: [],
        message: 'empty',
      },
      {
        schemaVersion: 1,
        type: 'cleared',
        analysisId: 'si-clear',
        scope: 'analysis',
        clearedAnalysisIds: ['si-one', 'si-two'],
        message: 'too many',
      },
      {
        schemaVersion: 1,
        type: 'cleared',
        analysisId: 'si-clear',
        scope: 'workspace',
        clearedAnalysisIds: ['si-one'],
        message: 'wrong scope',
      },
    ]

    for (const value of malformed) {
      expect(decodeInsightCommandResult(`[[skill-insight:v1]]${JSON.stringify(value)}`)).toBeNull()
    }
  })
})
