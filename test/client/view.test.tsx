// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describe, expect, test } from 'vitest'

import { SkillInsightView, type SkillInsightViewInjected } from '../../src/client/SkillInsightView.js'
import type { InsightReport, InsightViewSnapshot } from '../../src/shared/types.js'

const report: InsightReport = {
  schemaVersion: 1,
  analysisId: 'si-ui',
  sessionId: 'session-ui',
  cutoffSeq: 42,
  createdAt: '2026-08-15T00:00:00.000Z',
  requestedMode: 'hybrid',
  effectiveMode: 'hybrid',
  skill: { name: 'demo-skill', path: '/skill/SKILL.md', provider: 'filesystem' },
  summary: 'The Skill needs an explicit recovery branch.',
  metrics: { totalEvents: 42, toolCalls: 8, toolErrors: 2, repeatedToolCalls: 1, recoveryAttempts: 0 },
  issues: [{
    code: 'missing-recovery',
    severity: 'warning',
    title: 'Missing recovery',
    explanation: 'A failed tool call was not recovered.',
    recommendation: 'Add one bounded retry.',
    evidence: [{ seq: 17, type: 'tool/result', summary: 'file not found' }],
    source: 'rules',
  }],
  proposal: {
    revisedContent: '# New\n',
    unifiedDiff: '@@ -1 +1 @@\n-# Old\n+# New\n',
    beforeHash: 'before',
    afterHash: 'after',
  },
  validations: [{ code: 'trace-frozen', ok: true, message: 'Trace frozen.' }],
  warnings: [],
}

describe('SkillInsightView', () => {
  test('renders metrics, evidence, proposal diff, and apply action', () => {
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
    }
    const conversation = { views: new Map([['skill-insight', insight]]) }
    const props = {
      sessionId: 'session-ui',
      useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
      runCommand: async () => {},
    } as unknown as ConvViewProps & SkillInsightViewInjected

    const html = renderToStaticMarkup(createElement(SkillInsightView, props))

    expect(html).toContain('demo-skill')
    expect(html).toContain('42')
    expect(html).toContain('Missing recovery')
    expect(html).toContain('#17')
    expect(html).toContain('# New')
    expect(html).toContain('Apply proposal')
  })

  test('renders a command-first empty state', () => {
    const conversation = { views: new Map() }
    const props = {
      sessionId: 'session-ui',
      useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
      runCommand: async () => {},
    } as unknown as ConvViewProps & SkillInsightViewInjected

    const html = renderToStaticMarkup(createElement(SkillInsightView, props))

    expect(html).toContain('/skill-insight analyze')
    expect(html).toContain('Analyze trace')
  })
})
