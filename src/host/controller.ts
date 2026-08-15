import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import {
  createUserMessage,
  type GenerateOptions,
  type LlmRuntime,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SkillDefinition, SkillRegistry } from '@deepseek-ai/dsh-skill'

import { analyzeWithModel } from '../analysis/model.js'
import { ArtifactStore } from '../artifacts/store.js'
import type {
  AnalysisMode,
  InsightCompletedEvent,
  InsightReport,
} from '../shared/types.js'
import {
  applySkillProposal,
  createSkillProposal,
  readSkillSnapshot,
  revertSkillProposal,
} from '../skill/file.js'
import { normalizeTrace } from '../trace/normalize.js'
import { analyzeWithRules } from '../trace/rules.js'
import {
  parseSkillInsightCommand,
  selectSkillName,
  type SkillInsightCommand,
} from './command.js'

export interface SkillInsightDependencies {
  skills: Pick<SkillRegistry, 'get'>
  llm: Pick<LlmRuntime, 'stream'>
  artifacts?: ArtifactStore
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function cwdOf(session: Session): string | undefined {
  return session.header.cwd
}

function commandCutoff(invocation: CommandInvocation): number {
  const event = invocation.agent.session.events.findLast(
    (candidate) =>
      candidate.type === 'command/run' && candidate.data.commandId === invocation.commandId,
  )
  return event?.seq ?? invocation.agent.session.seq
}

function sourceEvents(session: Session, cutoffSeq: number) {
  return session.events
    .filter((event) => event.seq < cutoffSeq)
    .map((event) => ({
      seq: event.seq,
      time: event.time,
      type: event.type,
      data: event.data,
    }))
}

function validation(code: string, ok: boolean, text: string) {
  return { code, ok, message: text }
}

function mergeIssues<T extends { code: string }>(first: readonly T[], second: readonly T[]): T[] {
  const seen = new Set<string>()
  return [...first, ...second].filter((item) => {
    if (seen.has(item.code)) return false
    seen.add(item.code)
    return true
  })
}

function listReports(session: Session): InsightCompletedEvent[] {
  return session.events
    .filter((event) => event.type === 'skill-insight/completed')
    .map((event) => event.data)
}

export class SkillInsightController {
  private readonly artifacts: ArtifactStore
  private readonly activeSessions = new Set<string>()

  constructor(private readonly dependencies: SkillInsightDependencies) {
    this.artifacts = dependencies.artifacts ?? new ArtifactStore()
  }

  async execute(invocation: CommandInvocation): Promise<CommandResult> {
    let command: SkillInsightCommand
    try {
      command = parseSkillInsightCommand(invocation.rawInput)
    } catch (error) {
      return { kind: 'error', text: message(error) }
    }

    try {
      switch (command.action) {
        case 'analyze':
          return await this.executeAnalyze(invocation, command)
        case 'apply':
          return await this.executeApply(invocation, command.analysisId)
        case 'revert':
          return await this.executeRevert(invocation, command.analysisId)
        case 'show':
          return this.executeShow(invocation.agent.session, command.analysisId)
        case 'list':
          return this.executeList(invocation.agent.session)
      }
    } catch (error) {
      return { kind: 'error', text: message(error) }
    }
  }

  private async executeAnalyze(
    invocation: CommandInvocation,
    command: Extract<SkillInsightCommand, { action: 'analyze' }>,
  ): Promise<CommandResult> {
    const sessionKey = String(invocation.agent.id)
    if (this.activeSessions.has(sessionKey)) {
      return { kind: 'error', text: 'A Skill Insight analysis is already running for this session.' }
    }
    this.activeSessions.add(sessionKey)
    try {
      return await invocation.agent.runMaintenance(async maintenanceSignal => {
        const signal = AbortSignal.any([invocation.signal, maintenanceSignal])
        return this.analyze(invocation, command.mode, command.skillName, signal)
      })
    } finally {
      this.activeSessions.delete(sessionKey)
    }
  }

  private async analyze(
    invocation: CommandInvocation,
    requestedMode: AnalysisMode,
    explicitSkill: string | undefined,
    signal: AbortSignal,
  ): Promise<CommandResult> {
    const { agent } = invocation
    const cutoffSeq = commandCutoff(invocation)
    const trace = normalizeTrace(sourceEvents(agent.session, cutoffSeq))
    trace.cutoffSeq = cutoffSeq
    const skillName = selectSkillName(explicitSkill, trace.invokedSkills)
    const analysisId = `si-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
    const started = agent.session.append('skill-insight/started', {
      analysisId,
      cutoffSeq,
      requestedMode,
      skillName,
    })

    try {
      const skill = await this.dependencies.skills.get(skillName, {
        cwd: cwdOf(agent.session),
        scope: agent,
        signal,
      })
      const snapshot = await this.snapshot(skill, skillName)
      const rules = analyzeWithRules(trace, { selectedSkill: skillName })
      const warnings: string[] = []
      let effectiveMode: AnalysisMode = 'rules'
      let summary = rules.summary
      let issues = rules.issues
      let proposal = null

      if (requestedMode === 'hybrid') {
        const model = await this.modelAnalysis(agent, trace, snapshot.body, skillName, signal)
        if (model.result) {
          effectiveMode = 'hybrid'
          summary = model.result.summary
          issues = mergeIssues(rules.issues, model.result.issues)
          try {
            const candidate = createSkillProposal(snapshot, model.result.revisedSkillContent)
            if (candidate.afterHash === candidate.beforeHash) {
              warnings.push('The model returned the existing Skill content; no proposal was created.')
            } else {
              proposal = candidate
            }
          } catch (error) {
            warnings.push(`The model proposal was rejected: ${message(error)}`)
          }
        } else if (model.warning) {
          warnings.push(model.warning)
        }
      }

      const report: InsightReport = {
        schemaVersion: 1,
        analysisId,
        sessionId: String(agent.id),
        cutoffSeq,
        createdAt: new Date().toISOString(),
        requestedMode,
        effectiveMode,
        skill: { name: snapshot.name, path: snapshot.path, provider: snapshot.provider },
        summary,
        metrics: trace.metrics,
        issues,
        proposal,
        validations: [
          validation('trace-frozen', true, `Analyzed only events before sequence ${cutoffSeq}.`),
          validation('trace-redacted', true, 'Normalized trace values were redacted and bounded before analysis.'),
          validation('frontmatter-preserved', proposal === null || proposal.revisedContent.startsWith(snapshot.frontmatter), 'YAML frontmatter is preserved byte-for-byte.'),
          validation('rules-no-write', requestedMode !== 'rules' || proposal === null, 'Rules-only analysis never creates a writable proposal.'),
        ],
        warnings,
      }
      const artifactDirectory = await this.artifacts.writeAnalysis({ report, trace, skill: snapshot })
      const completed = agent.session.append('skill-insight/completed', { report, artifactDirectory })
      return {
        kind: 'success',
        text: `Skill Insight completed for ${skillName}: ${issues.length} issue(s).${proposal ? ' Review the proposal before applying it.' : ''}`,
        sourceEventSeq: completed.seq,
      }
    } catch (error) {
      agent.session.append('skill-insight/failed', { analysisId, message: message(error) })
      return { kind: 'error', text: `Skill Insight failed: ${message(error)}` }
    } finally {
      void started
    }
  }

  private async snapshot(skill: SkillDefinition | undefined, requestedName: string) {
    if (!skill) throw new Error(`Skill "${requestedName}" was not found.`)
    if (!skill.path) {
      throw new Error(`Skill "${requestedName}" is not file-backed and cannot be optimized safely.`)
    }
    return readSkillSnapshot({ name: skill.name, path: skill.path, provider: skill.provider })
  }

  private async modelAnalysis(
    agent: Agent,
    trace: ReturnType<typeof normalizeTrace>,
    skillContent: string,
    skillName: string,
    signal: AbortSignal,
  ) {
    const { provider, model } = agent.options
    if (!provider || !model) {
      return { result: null, warning: 'No provider/model is selected; hybrid analysis fell back to rules.' }
    }
    return analyzeWithModel({
      trace,
      skillName,
      skillContent,
      stream: request => this.streamModel({
        provider,
        model,
        system: request.system,
        prompt: request.prompt,
        maxTokens: request.maxTokens,
        sessionId: agent.id,
        signal,
      }),
    })
  }

  private async *streamModel(input: {
    provider: string
    model: string
    system: string
    prompt: string
    maxTokens: number
    sessionId: Agent['id']
    signal: AbortSignal
  }): AsyncIterable<StreamChunk> {
    const options: GenerateOptions = {
      provider: input.provider,
      model: input.model,
      system: input.system,
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: input.prompt }],
          source: {
            kind: 'plugin',
            plugin: 'deepseek-harness-skill-insight',
            form: 'instructions',
          },
        }),
      ],
      maxTokens: input.maxTokens,
      sessionId: input.sessionId,
      signal: input.signal,
    }
    yield* this.dependencies.llm.stream(options)
  }

  private async executeApply(
    invocation: CommandInvocation,
    analysisId: string,
  ): Promise<CommandResult> {
    return invocation.agent.runMaintenance(async () => {
      const restored = await this.artifacts.readAnalysis(String(invocation.agent.id), analysisId)
      const proposal = restored.report.proposal
      if (!proposal) throw new Error('This analysis has no model-generated proposal to apply.')
      await applySkillProposal(restored.skill, proposal)
      const event = invocation.agent.session.append('skill-insight/applied', {
        analysisId,
        skillName: restored.skill.name,
        appliedHash: proposal.afterHash,
      })
      return {
        kind: 'success',
        text: `Applied Skill Insight proposal ${analysisId} to ${restored.skill.name}.`,
        sourceEventSeq: event.seq,
      }
    })
  }

  private async executeRevert(
    invocation: CommandInvocation,
    analysisId: string,
  ): Promise<CommandResult> {
    return invocation.agent.runMaintenance(async () => {
      const restored = await this.artifacts.readAnalysis(String(invocation.agent.id), analysisId)
      const proposal = restored.report.proposal
      if (!proposal) throw new Error('This analysis has no proposal to revert.')
      await revertSkillProposal(restored.skill, proposal)
      const event = invocation.agent.session.append('skill-insight/reverted', {
        analysisId,
        skillName: restored.skill.name,
        restoredHash: proposal.beforeHash,
      })
      return {
        kind: 'success',
        text: `Reverted Skill Insight proposal ${analysisId} for ${restored.skill.name}.`,
        sourceEventSeq: event.seq,
      }
    })
  }

  private executeShow(session: Session, requestedId?: string): CommandResult {
    const reports = listReports(session)
    const selected = requestedId
      ? reports.find((item) => item.report.analysisId === requestedId)
      : reports.at(-1)
    if (!selected) return { kind: 'error', text: 'No matching Skill Insight analysis exists in this session.' }
    const { report } = selected
    return {
      kind: 'success',
      text: `${report.analysisId} · ${report.skill.name} · ${report.effectiveMode}\n${report.summary}\n${report.issues.length} issue(s) · artifacts: ${selected.artifactDirectory}`,
    }
  }

  private executeList(session: Session): CommandResult {
    const reports = listReports(session)
    if (reports.length === 0) return { kind: 'success', text: 'No Skill Insight analyses in this session.' }
    return {
      kind: 'success',
      text: reports
        .map(({ report }) => `${report.analysisId} · ${report.skill.name} · ${report.effectiveMode} · ${report.issues.length} issue(s)`)
        .join('\n'),
    }
  }
}
