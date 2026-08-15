import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
    const completed = events.find((event) => event.type === 'skill-insight/completed')
    const report = (completed?.data.report as { analysisId?: string; cutoffSeq?: number; proposal?: unknown })
    expect(report.cutoffSeq).toBe(1)
    expect(report.proposal).toBeTruthy()
    const analysisId = report.analysisId!

    const applied = await controller.execute(invocation(agent, events, `apply ${analysisId}`, 'cmd-2'))
    expect(applied.kind).toBe('success')
    expect(await readFile(skillPath, 'utf8')).toBe('# New\n\nRecover once.\n')

    const reverted = await controller.execute(invocation(agent, events, `revert ${analysisId}`, 'cmd-3'))
    expect(reverted.kind).toBe('success')
    expect(await readFile(skillPath, 'utf8')).toBe('# Old\n')
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'skill-insight/started',
      'skill-insight/completed',
      'skill-insight/applied',
      'skill-insight/reverted',
    ]))
  })
})
