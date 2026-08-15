import type {
  ConversationMatch,
  ConversationNodeContext,
} from '@deepseek-ai/dsh-client-runtime/client'
import { CommandId } from '@deepseek-ai/dsh-commands'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { describe, expect, test } from 'vitest'

import {
  EMPTY_INSIGHT_SNAPSHOT,
  InsightSnapshotBuilder,
  insightEventDefinition,
  type InsightConversationNode,
  type InsightProjectionState,
} from '../../src/client/projection.js'
import {
  analysisIdForCommandId,
  encodeInsightCommandResult,
} from '../../src/shared/envelope.js'
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

const analysisCommandId = CommandId('cmd-analysis')
const analysisId = analysisIdForCommandId(analysisCommandId)

const report: InsightReport = {
  schemaVersion: 1,
  analysisId,
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
  test('folds official command lifecycle events into one durable run', () => {
    const started = event('command/run', 4, {
      commandId: analysisCommandId, name: 'skill-insight', args: ' analyze --skill demo-skill --mode rules',
      source: { kind: 'user' },
    })
    let state = insightEventDefinition.start(
      {} as ConversationNodeContext<InsightProjectionState>,
      match(started, 'start'),
      { previous: () => undefined },
    )
    expect(state.run.status).toBe('running')

    const completed = event('command/done', 5, {
      commandId: analysisCommandId, kind: 'success', text: encodeInsightCommandResult({
        schemaVersion: 1,
        type: 'completed',
        analysisId,
        report,
        artifactDirectory: '/artifacts/analysis',
        message: 'Analysis completed.',
      }),
    })
    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(completed, 'update'),
    )
    expect(state.run.status).toBe('completed')
    expect(state.run.report).toEqual(report)

    const applyRun = event('command/run', 6, {
      commandId: CommandId('cmd-apply'), name: 'skill-insight', args: ` apply ${analysisId}`,
      source: { kind: 'user' },
    })
    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(applyRun, 'update'),
    )
    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(event('command/done', 7, {
        commandId: CommandId('cmd-apply'), kind: 'success', text: encodeInsightCommandResult({
          schemaVersion: 1, type: 'applied', analysisId, skillName: 'demo-skill',
          appliedHash: 'after', message: 'Applied.',
        }),
      }), 'update'),
    )
    expect(state.run.status).toBe('applied')

    state = insightEventDefinition.update(
      { state } as ConversationNodeContext<InsightProjectionState> & { state: InsightProjectionState },
      match(event('command/done', 8, {
        commandId: CommandId('cmd-revert'), kind: 'success', text: encodeInsightCommandResult({
          schemaVersion: 1, type: 'reverted', analysisId, skillName: 'demo-skill',
          restoredHash: 'before', message: 'Reverted.',
        }),
      }), 'update'),
    )
    expect(state.run.status).toBe('reverted')
  })

  test('builds a latest-first snapshot from incremental nodes', () => {
    const builder = new InsightSnapshotBuilder()
    expect(builder.empty).toBe(EMPTY_INSIGHT_SNAPSHOT)
    const first = {
      key: 'one', kind: 'skill-insight-run', id: analysisId, target: 'skill-insight', anchorSeq: 2,
      data: { analysisId, status: 'completed', report },
    } as InsightConversationNode
    const second = {
      key: 'two', kind: 'skill-insight-run', id: 'si-2', target: 'skill-insight', anchorSeq: 8,
      data: { analysisId: 'si-2', status: 'running' },
    } as InsightConversationNode

    const snapshot = builder.replace({ nodes: [first, second], timeline: { turnOrder: [], turns: new Map() } })

    expect(snapshot.latestAnalysisId).toBe('si-2')
    expect(snapshot.runs.map((run) => run.analysisId)).toEqual(['si-2', analysisId])
  })
})
