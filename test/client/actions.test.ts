import { describe, expect, test, vi } from 'vitest'

import {
  createSkillInsightActions,
  loadSkillOptions,
  type SkillOption,
} from '../../src/client/actions.js'

const skills: readonly SkillOption[] = [{
  name: 'demo-skill',
  description: 'Analyze a demo trace.',
  whenToUse: 'When tests need a real catalog row.',
  modelInvocable: true,
}]

describe('Skill Insight visual actions', () => {
  test('loads and unwraps the official Harness Skill catalog response', async () => {
    const list = vi.fn(async () => ({
      rpcId: 'rpc-skills',
      result: { ok: true as const, value: { skills } },
    }))

    await expect(loadSkillOptions({ skills: { list } } as never, 'session-ui' as never)).resolves.toEqual(skills)
    expect(list).toHaveBeenCalledWith({ sessionId: 'session-ui' })
  })

  test('turns Harness Skill catalog failures into actionable errors', async () => {
    const api = {
      skills: {
        list: async () => ({
          rpcId: 'rpc-skills',
          result: {
            ok: false as const,
            error: { code: 'internal', message: 'Catalog offline', details: {} },
          },
        }),
      },
    }

    await expect(loadSkillOptions(api as never, 'session-ui' as never)).rejects.toThrow(
      'Unable to load Skills: internal: Catalog offline',
    )
  })

  test('serializes analysis choices as private UI-origin commands', async () => {
    const lines: string[] = []
    const actions = createSkillInsightActions({
      runCommand: async (line) => { lines.push(line) },
      loadSkills: async () => skills,
    })

    await actions.analyze({ mode: 'hybrid' })
    await actions.analyze({ skillName: 'demo-skill', mode: 'rules' })

    expect(lines).toEqual([
      '/skill-insight analyze --mode hybrid --origin ui',
      '/skill-insight analyze --skill demo-skill --mode rules --origin ui',
    ])
  })

  test('serializes lifecycle actions without exposing command construction to the view', async () => {
    const lines: string[] = []
    const actions = createSkillInsightActions({
      runCommand: async (line) => { lines.push(line) },
      loadSkills: async () => skills,
    })

    await actions.apply('si-123')
    await actions.revert('si-123')
    await actions.clear('si-123')
    await actions.clearAll()

    expect(lines).toEqual([
      '/skill-insight apply si-123 --origin ui',
      '/skill-insight revert si-123 --origin ui',
      '/skill-insight clear si-123 --origin ui',
      '/skill-insight clear --all --confirm --origin ui',
    ])
  })

  test('delegates catalog loading and preserves complete Skill entries', async () => {
    const loadSkills = vi.fn(async () => skills)
    const actions = createSkillInsightActions({ runCommand: async () => {}, loadSkills })

    await expect(actions.loadSkills()).resolves.toEqual(skills)
    expect(loadSkills).toHaveBeenCalledOnce()
  })

  test('rejects unsafe identifiers before they enter a command and propagates operation errors', async () => {
    const failure = new Error('Host unavailable')
    const actions = createSkillInsightActions({
      runCommand: async () => { throw failure },
      loadSkills: async () => skills,
    })

    await expect(actions.analyze({ skillName: 'demo skill', mode: 'hybrid' })).rejects.toThrow(
      /Invalid Skill name/,
    )
    await expect(actions.clear('si-123 --all')).rejects.toThrow(/Invalid analysis id/)
    await expect(actions.apply('si-123')).rejects.toBe(failure)
  })
})
