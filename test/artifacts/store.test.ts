import { mkdtemp, readFile } from 'node:fs/promises'
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
  })
})
