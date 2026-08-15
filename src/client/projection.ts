import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationTimelineSnapshot,
  ConversationViewBuilder,
  ConversationViewDefinition,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'

import type {
  InsightRunView,
  InsightViewSnapshot,
} from '../shared/types.js'
import {
  analysisIdForCommandId,
  decodeInsightCommandResult,
  type InsightCommandEnvelope,
} from '../shared/envelope.js'
import { parseSkillInsightCommand } from '../host/command.js'

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    'skill-insight': InsightViewSnapshot
  }
}

export interface InsightProjectionState {
  anchorSeq: number
  run: InsightRunView
}

export interface InsightRunConversationNode extends ConversationViewNode {
  readonly kind: 'skill-insight-run'
  readonly target: 'skill-insight'
  readonly anchorSeq: number
  readonly data: InsightRunView
}

export interface InsightClearProjectionState {
  anchorSeq: number
  markerId: string
  clearedAnalysisIds: string[]
}

export interface InsightClearConversationNode extends ConversationViewNode {
  readonly kind: 'skill-insight-clear'
  readonly target: 'skill-insight'
  readonly anchorSeq: number
  readonly data: {
    markerId: string
    clearedAnalysisIds: string[]
  }
}

export interface InsightSkillInvocationProjectionState {
  anchorSeq: number
  skillName: string
}

export interface InsightSkillInvocationConversationNode extends ConversationViewNode {
  readonly kind: 'skill-insight-skill-invocation'
  readonly target: 'skill-insight'
  readonly anchorSeq: number
  readonly data: {
    skillName: string
  }
}

export type InsightConversationNode =
  | InsightRunConversationNode
  | InsightClearConversationNode
  | InsightSkillInvocationConversationNode

type InsightRunEnvelope = Exclude<InsightCommandEnvelope, { type: 'cleared' }>

const EMPTY_RUNS: readonly InsightRunView[] = []
const EMPTY_SKILL_NAMES: readonly string[] = []

export const EMPTY_INSIGHT_SNAPSHOT: InsightViewSnapshot = {
  latestAnalysisId: null,
  runs: EMPTY_RUNS as InsightRunView[],
  detectedSkillNames: EMPTY_SKILL_NAMES as string[],
}

function skillNameFromEvent(
  event: Parameters<ConversationNodeDefinition<InsightSkillInvocationProjectionState>['match']>[0],
): string | undefined {
  if (event.type !== 'tool/call' || event.data.name !== 'skill') return undefined
  try {
    const parsed: unknown = JSON.parse(event.data.arguments)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const name = (parsed as Record<string, unknown>).name
    return typeof name === 'string' && name.trim() ? name.trim() : undefined
  } catch {
    return undefined
  }
}

export const insightSkillInvocationDefinition:
ConversationNodeDefinition<InsightSkillInvocationProjectionState> = {
  kind: 'skill-insight-skill-invocation',
  target: 'skill-insight',
  match: (event) => {
    const skillName = skillNameFromEvent(event)
    return skillName === undefined || event.type !== 'tool/call'
      ? null
      : { id: String(event.data.callId), role: 'start' as const }
  },
  start: (_context, match) => {
    const skillName = skillNameFromEvent(match.event)
    if (skillName === undefined) {
      throw new Error('skill-insight-skill-invocation start requires a valid Skill tool call')
    }
    return { anchorSeq: match.event.seq, skillName }
  },
  update: (context) => context.state,
  buildViewNode: (context) => context.state
    ? {
      key: context.key,
      kind: 'skill-insight-skill-invocation',
      id: context.id,
      target: 'skill-insight',
      anchorSeq: context.state.anchorSeq,
      data: { skillName: context.state.skillName },
    } satisfies InsightSkillInvocationConversationNode
    : null,
}

function clearError(run: InsightRunView): InsightRunView {
  const value = { ...run }
  delete value.error
  return value
}

function updateState(
  state: InsightProjectionState,
  event: Parameters<ConversationNodeDefinition<InsightProjectionState>['update']>[1]['event'],
): InsightProjectionState {
  if (event.type === 'command/run') {
    return { anchorSeq: event.seq, run: clearError(state.run) }
  }
  if (event.type !== 'command/done') return state
  const envelope = decodeInsightCommandResult(event.data.text)
  return envelope === null || envelope.type === 'cleared'
    ? state
    : stateFromEnvelope(envelope, event.seq, state)
}

function stateFromEnvelope(
  envelope: InsightRunEnvelope,
  anchorSeq: number,
  previous?: InsightProjectionState,
): InsightProjectionState {
  if (envelope.type === 'completed') {
    return {
      anchorSeq,
      run: {
        analysisId: envelope.report.analysisId,
        status: 'completed',
        skillName: envelope.report.skill.name,
        requestedMode: envelope.report.requestedMode,
        cutoffSeq: envelope.report.cutoffSeq,
        report: envelope.report,
        artifactDirectory: envelope.artifactDirectory,
      },
    }
  }
  const base = previous?.run ?? { analysisId: envelope.analysisId, status: 'running' as const }
  const clean = clearError(base)
  if (envelope.type === 'failed') {
    const status = envelope.operation === 'analyze' || envelope.operation === 'command' || !base.report
      ? 'failed'
      : base.status
    return { anchorSeq, run: { ...base, status, error: envelope.message } }
  }
  return {
    anchorSeq,
    run: {
      ...clean,
      status: envelope.type,
      skillName: envelope.skillName,
    },
  }
}

function commandMatch(event: Parameters<ConversationNodeDefinition<InsightProjectionState>['match']>[0]) {
  if (event.type === 'command/done') {
    const envelope = decodeInsightCommandResult(event.data.text)
    if (envelope === null || envelope.type === 'cleared'
      || (envelope.type === 'failed' && envelope.operation === 'clear')) return null
    return { id: envelope.analysisId, role: 'update' as const }
  }
  if (event.type !== 'command/run' || event.data.name !== 'skill-insight') return null
  try {
    const command = parseSkillInsightCommand(event.data.args ?? '')
    if (command.action === 'analyze') {
      return { id: analysisIdForCommandId(event.data.commandId), role: 'start' as const }
    }
    if (command.action === 'apply' || command.action === 'revert') {
      return { id: command.analysisId, role: 'update' as const }
    }
    return null
  } catch {
    return { id: analysisIdForCommandId(event.data.commandId), role: 'start' as const }
  }
}

export const insightEventDefinition: ConversationNodeDefinition<InsightProjectionState> = {
  kind: 'skill-insight-run',
  target: 'skill-insight',
  match: commandMatch,
  start: (_context, match) => {
    if (match.event.type !== 'command/run') {
      throw new Error('skill-insight-run start requires command/run')
    }
    let skillName: string | undefined
    let requestedMode: InsightRunView['requestedMode']
    try {
      const command = parseSkillInsightCommand(match.event.data.args ?? '')
      if (command.action === 'analyze') {
        skillName = command.skillName
        requestedMode = command.mode
      }
    } catch {
      // Invalid syntax still receives the paired, durable failed result.
    }
    return {
      anchorSeq: match.event.seq,
      run: {
        analysisId: analysisIdForCommandId(match.event.data.commandId),
        status: 'running',
        ...skillName === undefined ? {} : { skillName },
        ...requestedMode === undefined ? {} : { requestedMode },
        cutoffSeq: match.event.seq,
      },
    }
  },
  update: (context, match) => updateState(context.state, match.event),
  buildViewNode: (context: ConversationNodeContext<InsightProjectionState>) => {
    let state = context.state
    if (!state) {
      const settled = context.matches.findLast((match) => {
        if (match.event.type !== 'command/done') return false
        const envelope = decodeInsightCommandResult(match.event.data.text)
        return envelope !== null && envelope.type !== 'cleared'
      })
      if (settled?.event.type === 'command/done') {
        const envelope = decodeInsightCommandResult(settled.event.data.text)
        if (envelope && envelope.type !== 'cleared') {
          state = stateFromEnvelope(envelope, settled.event.seq)
        }
      }
    }
    if (!state) return null
    return {
      key: context.key,
      kind: 'skill-insight-run',
      id: context.id,
      target: 'skill-insight',
      anchorSeq: state.anchorSeq,
      data: state.run,
    } satisfies InsightRunConversationNode
  },
}

export const insightClearEventDefinition: ConversationNodeDefinition<InsightClearProjectionState> = {
  kind: 'skill-insight-clear',
  target: 'skill-insight',
  match: (event) => {
    if (event.type !== 'command/done') return null
    const envelope = decodeInsightCommandResult(event.data.text)
    return envelope?.type === 'cleared'
      ? { id: envelope.analysisId, role: 'start' as const }
      : null
  },
  start: (_context, match) => {
    if (match.event.type !== 'command/done') {
      throw new Error('skill-insight-clear start requires command/done')
    }
    const envelope = decodeInsightCommandResult(match.event.data.text)
    if (envelope?.type !== 'cleared') {
      throw new Error('skill-insight-clear start requires a cleared result')
    }
    return {
      anchorSeq: match.event.seq,
      markerId: envelope.analysisId,
      clearedAnalysisIds: envelope.clearedAnalysisIds,
    }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    if (!context.state) return null
    return {
      key: context.key,
      kind: 'skill-insight-clear',
      id: context.id,
      target: 'skill-insight',
      anchorSeq: context.state.anchorSeq,
      data: {
        markerId: context.state.markerId,
        clearedAnalysisIds: context.state.clearedAnalysisIds,
      },
    } satisfies InsightClearConversationNode
  },
}

export class InsightSnapshotBuilder implements ConversationViewBuilder<
  InsightConversationNode,
  InsightViewSnapshot
> {
  readonly empty = EMPTY_INSIGHT_SNAPSHOT
  private readonly nodes = new Map<string, InsightConversationNode>()

  replace(input: {
    readonly nodes: readonly InsightConversationNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): InsightViewSnapshot {
    this.nodes.clear()
    for (const node of input.nodes) this.nodes.set(node.key, node)
    return this.snapshot()
  }

  apply(input: {
    readonly upserts: readonly InsightConversationNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): InsightViewSnapshot {
    for (const node of input.upserts) this.nodes.set(node.key, node)
    return this.snapshot()
  }

  private snapshot(): InsightViewSnapshot {
    const clearedAnalysisIds = new Set<string>()
    const runs: InsightRunConversationNode[] = []
    const skillInvocations: InsightSkillInvocationConversationNode[] = []
    for (const node of this.nodes.values()) {
      if (node.kind === 'skill-insight-clear') {
        for (const analysisId of node.data.clearedAnalysisIds) clearedAnalysisIds.add(analysisId)
      } else if (node.kind === 'skill-insight-run') {
        runs.push(node)
      } else {
        skillInvocations.push(node)
      }
    }
    const ordered = runs
      .filter((node) => !clearedAnalysisIds.has(node.data.analysisId))
      .sort(
      (left, right) => right.anchorSeq - left.anchorSeq || right.id.localeCompare(left.id),
      )
    const detectedSkillNames = [...new Set(
      skillInvocations
        .sort((left, right) => right.anchorSeq - left.anchorSeq || right.id.localeCompare(left.id))
        .map((node) => node.data.skillName),
    )]
    return {
      latestAnalysisId: ordered[0]?.data.analysisId ?? null,
      runs: ordered.map((node) => node.data),
      detectedSkillNames,
    }
  }
}

export const insightViewDefinition: ConversationViewDefinition<
  InsightConversationNode,
  InsightViewSnapshot
> = {
  target: 'skill-insight',
  create: () => new InsightSnapshotBuilder(),
}

export function registerInsightProjection(ctx: Context): void {
  ctx.conversationEvents.register(insightSkillInvocationDefinition)
  ctx.conversationEvents.register(insightEventDefinition)
  ctx.conversationEvents.register(insightClearEventDefinition)
  ctx.conversationViews.register(insightViewDefinition)
}
