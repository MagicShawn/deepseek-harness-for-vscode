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

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    'skill-insight': InsightViewSnapshot
  }
}

export interface InsightProjectionState {
  anchorSeq: number
  run: InsightRunView
}

export interface InsightConversationNode extends ConversationViewNode {
  readonly target: 'skill-insight'
  readonly anchorSeq: number
  readonly data: InsightRunView
}

const EMPTY_RUNS: readonly InsightRunView[] = []

export const EMPTY_INSIGHT_SNAPSHOT: InsightViewSnapshot = {
  latestAnalysisId: null,
  runs: EMPTY_RUNS as InsightRunView[],
}

function updateState(
  state: InsightProjectionState,
  event: Parameters<ConversationNodeDefinition<InsightProjectionState>['update']>[1]['event'],
): InsightProjectionState {
  switch (event.type) {
    case 'skill-insight/completed':
      return {
        anchorSeq: event.seq,
        run: {
          analysisId: event.data.report.analysisId,
          status: 'completed',
          skillName: event.data.report.skill.name,
          requestedMode: event.data.report.requestedMode,
          cutoffSeq: event.data.report.cutoffSeq,
          report: event.data.report,
          artifactDirectory: event.data.artifactDirectory,
        },
      }
    case 'skill-insight/failed':
      return {
        anchorSeq: event.seq,
        run: { ...state.run, status: 'failed', error: event.data.message },
      }
    case 'skill-insight/applied':
      return {
        anchorSeq: event.seq,
        run: { ...state.run, status: 'applied', skillName: event.data.skillName },
      }
    case 'skill-insight/reverted':
      return {
        anchorSeq: event.seq,
        run: { ...state.run, status: 'reverted', skillName: event.data.skillName },
      }
    default:
      return state
  }
}

export const insightEventDefinition: ConversationNodeDefinition<InsightProjectionState> = {
  kind: 'skill-insight-run',
  target: 'skill-insight',
  match: event => {
    if (event.type === 'skill-insight/started') {
      return { id: event.data.analysisId, role: 'start' }
    }
    if (
      event.type === 'skill-insight/completed' ||
      event.type === 'skill-insight/failed' ||
      event.type === 'skill-insight/applied' ||
      event.type === 'skill-insight/reverted'
    ) {
      const analysisId = event.type === 'skill-insight/completed'
        ? event.data.report.analysisId
        : event.data.analysisId
      return { id: analysisId, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'skill-insight/started') {
      throw new Error('skill-insight-run start requires skill-insight/started')
    }
    return {
      anchorSeq: match.event.seq,
      run: {
        analysisId: match.event.data.analysisId,
        status: 'running',
        skillName: match.event.data.skillName,
        requestedMode: match.event.data.requestedMode,
        cutoffSeq: match.event.data.cutoffSeq,
      },
    }
  },
  update: (context, match) => updateState(context.state, match.event),
  buildViewNode: (context: ConversationNodeContext<InsightProjectionState>) => {
    if (!context.state) return null
    return {
      key: context.key,
      kind: 'skill-insight-run',
      id: context.id,
      target: 'skill-insight',
      anchorSeq: context.state.anchorSeq,
      data: context.state.run,
    } satisfies InsightConversationNode
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
    const ordered = [...this.nodes.values()].sort(
      (left, right) => right.anchorSeq - left.anchorSeq || right.id.localeCompare(left.id),
    )
    return {
      latestAnalysisId: ordered[0]?.data.analysisId ?? null,
      runs: ordered.map((node) => node.data),
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
  ctx.conversationEvents.register(insightEventDefinition)
  ctx.conversationViews.register(insightViewDefinition)
}
