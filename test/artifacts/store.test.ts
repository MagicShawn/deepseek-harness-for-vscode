import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { ArtifactStore } from '../../src/artifacts/store.js'
import type { InsightReport, NormalizedTrace, SkillSourceSnapshot } from '../../src/shared/types.js'

describe('ArtifactStore', () => {
  test('writes the stable local report contract and proposal artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-insight-store-'))
    const store = new ArtifactStore(root)
    const trace: NormalizedTrace = {
      cutoffSeq: 2,
      events: [{ seq: 1, time: 1, type: 'user/message', summary: 'hello' }],
      invokedSkills: ['demo-skill'],
      truncatedEvents: 0,
      metrics: { totalEvents: 1, toolCalls: 0, toolErrors: 0, repeatedToolCalls: 0, recoveryAttempts: 0 },
    }
    const skill: SkillSourceSnapshot = {
      name: 'demo-skill',
      path: '/skills/demo/SKILL.md',
      provider: 'filesystem',
      rawContent: '# Old\n',
      frontmatter: '',
      body: '# Old\n',
      newline: '\n',
      baselineHash: 'before',
    }
    const report: InsightReport = {
      schemaVersion: 1,
      analysisId: 'analysis:unsafe',
      sessionId: 'session/unsafe',
      cutoffSeq: 2,
      createdAt: '2026-08-15T00:00:00.000Z',
      requestedMode: 'hybrid',
      effectiveMode: 'rules',
      skill: { name: skill.name, path: skill.path, provider: skill.provider },
      summary: 'No issue.',
      metrics: trace.metrics,
      issues: [],
      proposal: null,
      validations: [],
      warnings: ['Model unavailable.'],
    }

    const directory = await store.writeAnalysis({ report, trace, skill })
    const saved = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')) as InsightReport

    expect(directory).toMatch(/session_unsafe.*analysis_unsafe/)
    expect(saved.schemaVersion).toBe(1)
    expect(saved.analysisId).toBe('analysis:unsafe')
    expect(await readFile(join(directory, 'trace.normalized.json'), 'utf8')).toContain('user/message')
    expect(await readFile(join(directory, 'snapshots', 'SKILL.before.md'), 'utf8')).toBe('# Old\n')

    const restored = await store.readAnalysis('session/unsafe', 'analysis:unsafe')
    expect(restored.report).toEqual(report)
    expect(restored.skill.rawContent).toBe('# Old\n')
  })

  test('removes one analysis directory idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-insight-store-'))
    const store = new ArtifactStore(root)
    const directory = store.directoryFor('session-1', 'analysis-1')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'report.json'), '{}\n', 'utf8')

    await expect(store.removeAnalysis('session-1', 'analysis-1')).resolves.toBe(true)
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(store.removeAnalysis('session-1', 'analysis-1')).resolves.toBe(false)
  })

  test('contains unsafe identifiers below the configured artifact root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'skill-insight-store-'))
    const root = join(parent, 'artifacts')
    const outside = join(parent, 'outside.txt')
    await mkdir(root, { recursive: true })
    await writeFile(outside, 'keep me', 'utf8')
    const store = new ArtifactStore(root)
    const directory = store.directoryFor('../../outside-session', '..\\..\\outside-analysis')
    await mkdir(directory, { recursive: true })

    await expect(
      store.removeAnalysis('../../outside-session', '..\\..\\outside-analysis'),
    ).resolves.toBe(true)
    await expect(readFile(outside, 'utf8')).resolves.toBe('keep me')
  })

  test('refuses a symbolic-link analysis directory without touching its target', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'skill-insight-store-'))
    const root = join(parent, 'artifacts')
    const target = join(parent, 'external-target')
    const store = new ArtifactStore(root)
    const directory = store.directoryFor('session-1', 'analysis-link')
    await mkdir(join(root, 'session-1'), { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'keep.txt'), 'keep me', 'utf8')
    await symlink(target, directory, 'junction')

    await expect(store.removeAnalysis('session-1', 'analysis-link')).rejects.toThrow(
      /symbolic-link artifact directory/i,
    )
    await expect(readFile(join(target, 'keep.txt'), 'utf8')).resolves.toBe('keep me')
  })

  test('refuses a symbolic-link session directory without touching an external analysis', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'skill-insight-store-'))
    const root = join(parent, 'artifacts')
    const externalSession = join(parent, 'external-session')
    const externalAnalysis = join(externalSession, 'analysis-1')
    await mkdir(root, { recursive: true })
    await mkdir(externalAnalysis, { recursive: true })
    await writeFile(join(externalAnalysis, 'keep.txt'), 'keep me', 'utf8')
    await symlink(externalSession, join(root, 'session-1'), 'junction')
    const store = new ArtifactStore(root)

    await expect(store.removeAnalysis('session-1', 'analysis-1')).rejects.toThrow(
      /symbolic-link session directory/i,
    )
    await expect(readFile(join(externalAnalysis, 'keep.txt'), 'utf8')).resolves.toBe('keep me')
  })
})
