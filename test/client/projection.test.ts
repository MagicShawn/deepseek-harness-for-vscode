import type {
  ConversationMatch,
  ConversationNodeContext,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, test } from 'vitest'

import {
  EMPTY_INSIGHT_SNAPSHOT,
  InsightSnapshotBuilder,
  insightEventDefinition,
  type InsightConversationNode,
  type InsightProjectionState,
} from '../../src/client/projection.js'
import type { InsightReport } from '../../src/shared/types.js'

function event<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time: seq, data, ignorable: true } as Extract<SessionEvent, { type: T }>
}

function match(value: SessionEvent, role: 'start' | 'update'): ConversationMatch {
  return { event: value, view: undefined, role, location: { kind: 'session' } }
}

const report: InsightReport = {
  schemaVersion: 1,
  analysisId: 'si-1',
  sessionId: 'session-1',
  cutoffSeq: 3,
  createdAt: '2026-08-15T00:00:00.000Z',
  requestedMode: 'rules',
  effectiveMode: 'rules',
  skill: { name: 'demo-skill', path: '/skill/SKILL.md', provider: 'filesystem' },
  summary: 'One issue.',
  metrics: { totalEvents: 3, toolCalls: 1, toolErrors: 1, repeatedToolCalls: 0, recoveryAttempts: 0 },
  issues: [],
  proposal: null,
  validations: [],
  warnings: [],
}

describe('Skill Insight client projection', () => {
  test('folds started, completed, applied, and reverted events into one run', () => {
    const started = event('skill-insight/started', 4, {
      analysisId: 'si-1', cutoffSeq: 3, requestedMode: 'rules', skillName: 'demo-skill',
    })
    let state = insightEventDefinition.start(
      {} as ConversationNodeContext<InsightProjectionState>,
      match(started, 'start'),
      { previous: () => undefined },
    )
    expect(state.run.status).toBe('running')

    const completed = event('skill-insight/completed', 5, {
      report,
      artifactDirectory: '/artifacts/si-1',
    })
    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(completed, 'update'),
    )
    expect(state.run.status).toBe('completed')
    expect(state.run.report).toEqual(report)

    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(event('skill-insight/applied', 6, {
        analysisId: 'si-1', skillName: 'demo-skill', appliedHash: 'after',
      }), 'update'),
    )
    expect(state.run.status).toBe('applied')

    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(event('skill-insight/reverted', 7, {
        analysisId: 'si-1', skillName: 'demo-skill', restoredHash: 'before',
      }), 'update'),
    )
    expect(state.run.status).toBe('reverted')
  })

  test('builds a latest-first snapshot from incremental nodes', () => {
    const builder = new InsightSnapshotBuilder()
    expect(builder.empty).toBe(EMPTY_INSIGHT_SNAPSHOT)
    const first = {
      key: 'one', kind: 'skill-insight-run', id: 'si-1', target: 'skill-insight', anchorSeq: 2,
      data: { analysisId: 'si-1', status: 'completed', report },
    } as InsightConversationNode
    const second = {
      key: 'two', kind: 'skill-insight-run', id: 'si-2', target: 'skill-insight', anchorSeq: 8,
      data: { analysisId: 'si-2', status: 'running' },
    } as InsightConversationNode

    const snapshot = builder.replace({ nodes: [first, second], timeline: { turnOrder: [], turns: new Map() } })

    expect(snapshot.latestAnalysisId).toBe('si-2')
    expect(snapshot.runs.map((run) => run.analysisId)).toEqual(['si-2', 'si-1'])
  })
})
