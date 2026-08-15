import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { describe, expect, test } from 'vitest'

import { ArtifactStore } from '../../src/artifacts/store.js'
import { SkillInsightController } from '../../src/host/controller.js'
import {
  decodeInsightCommandResult,
  encodeInsightCommandResult,
} from '../../src/shared/envelope.js'
import type { InsightReport } from '../../src/shared/types.js'

interface FakeEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
}

function harnessSession(cwd: string): { session: Session; events: FakeEvent[] } {
  const events: FakeEvent[] = [
    {
      type: 'tool/call',
      seq: 0,
      time: 1,
      data: {
        turn: 0,
        step: 0,
        callId: 'skill-call',
        name: 'skill',
        arguments: '{"name":"demo-skill"}',
      },
    },
  ]
  const session = {
    id: 'session-1',
    header: { cwd },
    get seq() {
      return events.length
    },
    get events() {
      return events
    },
    append(type: string, data: Record<string, unknown>) {
      const event = { type, data, seq: events.length, time: Date.now() }
      events.push(event)
      return event
    },
  } as unknown as Session
  return { session, events }
}

function harnessAgent(session: Session): Agent {
  return {
    id: session.id,
    session,
    options: { provider: 'test-provider', model: 'test-model' },
    status: 'idle',
    runMaintenance: (task: (signal: AbortSignal) => Promise<unknown>) => task(new AbortController().signal),
  } as unknown as Agent
}

function invocation(agent: Agent, events: FakeEvent[], rawInput: string, id: string): CommandInvocation {
  events.push({
    type: 'command/run',
    seq: events.length,
    time: Date.now(),
    data: { commandId: id, name: 'skill-insight', source: { kind: 'user' } },
  })
  return {
    agent,
    commandId: id,
    rawInput,
    signal: new AbortController().signal,
  } as unknown as CommandInvocation
}

function completedReport(analysisId: string, sessionId = 'session-1'): InsightReport {
  return {
    schemaVersion: 1,
    analysisId,
    sessionId,
    cutoffSeq: 1,
    createdAt: '2026-08-15T00:00:00.000Z',
    requestedMode: 'rules',
    effectiveMode: 'rules',
    skill: { name: 'demo-skill', path: '/skills/demo/SKILL.md', provider: 'filesystem' },
    summary: `Report ${analysisId}`,
    metrics: {
      totalEvents: 1,
      toolCalls: 0,
      toolErrors: 0,
      repeatedToolCalls: 0,
      recoveryAttempts: 0,
    },
    issues: [],
    proposal: null,
    validations: [],
    warnings: [],
  }
}

function appendCompleted(events: FakeEvent[], report: InsightReport, artifactDirectory: string): void {
  events.push({
    type: 'command/done',
    seq: events.length,
    time: Date.now(),
    data: {
      commandId: `command-${report.analysisId}`,
      kind: 'success',
      text: encodeInsightCommandResult({
        schemaVersion: 1,
        type: 'completed',
        analysisId: report.analysisId,
        report,
        artifactDirectory,
        message: 'Completed.',
      }),
    },
  })
}

function appendDone(events: FakeEvent[], commandId: string, text: string): void {
  events.push({
    type: 'command/done',
    seq: events.length,
    time: Date.now(),
    data: { commandId, kind: 'success', text },
  })
}

function cleanupController(artifacts: ArtifactStore): SkillInsightController {
  return new SkillInsightController({
    skills: { get: async () => undefined },
    llm: { async *stream() {} },
    artifacts,
  } as unknown as ConstructorParameters<typeof SkillInsightController>[0])
}

describe('SkillInsightController', () => {
  test('runs hybrid analysis, persists it, then applies and reverts by hash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-controller-'))
    const skillPath = join(directory, 'SKILL.md')
    await writeFile(skillPath, '# Old\n', 'utf8')
    const { session, events } = harnessSession(directory)
    const agent = harnessAgent(session)
    const skills = {
      get: async () => ({
        name: 'demo-skill',
        description: 'Demo',
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: 'filesystem',
        path: skillPath,
        content: '# Old\n',
      }),
    } as unknown as Pick<SkillRegistry, 'get'>
    const llm = {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          summary: 'Add a recovery instruction.',
          issues: [],
          revisedSkillContent: '# New\n\nRecover once.\n',
        }) }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    } as unknown as Pick<LlmRuntime, 'stream'>
    const controller = new SkillInsightController({
      skills,
      llm,
      artifacts: new ArtifactStore(join(directory, 'artifacts')),
    })

    const analyzed = await controller.execute(invocation(agent, events, 'analyze', 'cmd-1'))

    expect(analyzed.kind).toBe('success')
    const completed = decodeInsightCommandResult(analyzed.text)
    expect(completed?.type).toBe('completed')
    if (!completed || completed.type !== 'completed') throw new Error('Expected a completed analysis envelope.')
    const report = completed.report
    expect(report.cutoffSeq).toBe(1)
    expect(report.proposal).toBeTruthy()
    const analysisId = report.analysisId
    events.push({
      type: 'command/done', seq: events.length, time: Date.now(),
      data: { commandId: 'cmd-1', kind: 'success', text: analyzed.text },
    })

    const applied = await controller.execute(invocation(agent, events, `apply ${analysisId}`, 'cmd-2'))
    expect(applied.kind).toBe('success')
    expect(decodeInsightCommandResult(applied.text)?.type).toBe('applied')
    expect(await readFile(skillPath, 'utf8')).toBe('# New\n\nRecover once.\n')

    const reverted = await controller.execute(invocation(agent, events, `revert ${analysisId}`, 'cmd-3'))
    expect(reverted.kind).toBe('success')
    expect(decodeInsightCommandResult(reverted.text)?.type).toBe('reverted')
    expect(await readFile(skillPath, 'utf8')).toBe('# Old\n')
    expect(events.every((event) => !event.type.startsWith('skill-insight/'))).toBe(true)
  })

  test('clears only the selected current-session analysis and keeps the applied Skill unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-controller-'))
    const skillPath = join(directory, 'SKILL.md')
    await writeFile(skillPath, '# Applied\n', 'utf8')
    const artifacts = new ArtifactStore(join(directory, 'artifacts'))
    const firstDirectory = artifacts.directoryFor('session-1', 'si-one')
    const secondDirectory = artifacts.directoryFor('session-1', 'si-two')
    const otherSessionDirectory = artifacts.directoryFor('session-2', 'si-one')
    for (const artifactDirectory of [firstDirectory, secondDirectory, otherSessionDirectory]) {
      await mkdir(artifactDirectory, { recursive: true })
      await writeFile(join(artifactDirectory, 'report.json'), '{}\n', 'utf8')
    }
    const { session, events } = harnessSession(directory)
    appendCompleted(events, completedReport('si-one'), firstDirectory)
    appendCompleted(events, completedReport('si-two'), secondDirectory)
    const agent = harnessAgent(session)
    const controller = cleanupController(artifacts)

    const result = await controller.execute(invocation(agent, events, 'clear si-one', 'clear-one'))

    expect(result.kind).toBe('success')
    const cleared = decodeInsightCommandResult(result.text)
    expect(cleared).toMatchObject({
      type: 'cleared',
      scope: 'analysis',
      clearedAnalysisIds: ['si-one'],
    })
    await expect(access(firstDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(secondDirectory)).resolves.toBeUndefined()
    await expect(access(otherSessionDirectory)).resolves.toBeUndefined()
    await expect(readFile(skillPath, 'utf8')).resolves.toBe('# Applied\n')
    expect(events.every((event) => !event.type.startsWith('skill-insight/'))).toBe(true)

    if (!result.text) throw new Error('Expected the cleanup result to include a durable envelope.')
    appendDone(events, 'clear-one', result.text)
    const listed = await controller.execute(invocation(agent, events, 'list', 'list-after-clear'))
    expect(listed.text).toContain('si-two')
    expect(listed.text).not.toContain('si-one')
    const shown = await controller.execute(invocation(agent, events, 'show si-one', 'show-cleared'))
    expect(shown.kind).toBe('error')
  })

  test('clears all active analyses only in the current session and handles an empty repeat safely', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-controller-'))
    const artifacts = new ArtifactStore(join(directory, 'artifacts'))
    const currentDirectories = ['si-one', 'si-two'].map((id) => artifacts.directoryFor('session-1', id))
    const otherSessionDirectory = artifacts.directoryFor('session-2', 'si-three')
    for (const artifactDirectory of [...currentDirectories, otherSessionDirectory]) {
      await mkdir(artifactDirectory, { recursive: true })
      await writeFile(join(artifactDirectory, 'report.json'), '{}\n', 'utf8')
    }
    const { session, events } = harnessSession(directory)
    appendCompleted(events, completedReport('si-one'), currentDirectories[0]!)
    appendCompleted(events, completedReport('si-two'), currentDirectories[1]!)
    const agent = harnessAgent(session)
    const controller = cleanupController(artifacts)

    const result = await controller.execute(
      invocation(agent, events, 'clear --all --confirm', 'clear-all'),
    )

    expect(result.kind).toBe('success')
    expect(decodeInsightCommandResult(result.text)).toMatchObject({
      type: 'cleared',
      scope: 'session',
      clearedAnalysisIds: ['si-one', 'si-two'],
    })
    for (const artifactDirectory of currentDirectories) {
      await expect(access(artifactDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    await expect(access(otherSessionDirectory)).resolves.toBeUndefined()

    if (!result.text) throw new Error('Expected the cleanup result to include a durable envelope.')
    appendDone(events, 'clear-all', result.text)
    const repeated = await controller.execute(
      invocation(agent, events, 'clear --all --confirm', 'clear-all-again'),
    )
    expect(repeated).toEqual({ kind: 'success', text: 'No active Skill Insight analyses to clear in this session.' })
    const unknown = await controller.execute(invocation(agent, events, 'clear si-missing', 'clear-missing'))
    expect(unknown.kind).toBe('error')
    expect(decodeInsightCommandResult(unknown.text)).toMatchObject({
      type: 'failed',
      operation: 'clear',
    })
  })
})
