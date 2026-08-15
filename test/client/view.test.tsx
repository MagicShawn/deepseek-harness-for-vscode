// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SkillInsightView, type SkillInsightViewInjected } from '../../src/client/SkillInsightView.js'
import { SkillInsightCommandCard } from '../../src/client/SkillInsightCommandCard.js'
import { encodeInsightCommandResult } from '../../src/shared/envelope.js'
import type { InsightReport, InsightViewSnapshot } from '../../src/shared/types.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

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

function viewProps(insight: InsightViewSnapshot, runCommand: (line: string) => Promise<void>) {
  const conversation = { views: new Map([['skill-insight', insight]]) }
  return {
    sessionId: 'session-ui',
    useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
    runCommand,
  } as unknown as ConvViewProps & SkillInsightViewInjected
}

async function renderInteractive(props: ConvViewProps & SkillInsightViewInjected): Promise<{
  container: HTMLDivElement
  root: Root
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(SkillInsightView, props))
  })
  return { container, root }
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === label)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`)
  return match
}

async function click(target: HTMLButtonElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('SkillInsightView', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
    document.body.replaceChildren()
  })

  test('renders a concise command card instead of the persisted JSON envelope', () => {
    const text = encodeInsightCommandResult({
      schemaVersion: 1,
      type: 'completed',
      analysisId: 'si-ui',
      report,
      artifactDirectory: '/artifacts',
      message: 'Analysis completed for demo-skill.',
    })
    const html = renderToStaticMarkup(createElement(SkillInsightCommandCard, {
      node: {
        kind: 'command', seq: 43, time: 1, commandId: 'cmd-ui', name: 'skill-insight',
        args: ' analyze', outcome: { kind: 'success', text },
      },
    } as never))

    expect(html).toContain('Analysis completed for demo-skill.')
    expect(html).not.toContain('[[skill-insight:v1]]')
    expect(html).not.toContain('artifactDirectory')
  })

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

  test('requires confirmation before clearing one analysis and supports cancellation', async () => {
    const runCommand = vi.fn(async () => {})
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
    }
    const { container, root } = await renderInteractive(viewProps(insight, runCommand))

    await click(button(container, 'Clear analysis'))
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Session history remains unchanged',
    )
    await click(button(container, 'Cancel'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(runCommand).not.toHaveBeenCalled()

    await click(button(container, 'Clear analysis'))
    await click(button(container, 'Confirm clear'))
    expect(runCommand).toHaveBeenCalledWith('/skill-insight clear si-ui')
    await act(async () => root.unmount())
  })

  test('uses the explicit confirmed command for clearing all current-session analyses', async () => {
    const runCommand = vi.fn(async () => {})
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [
        { analysisId: 'si-ui', status: 'applied', report, artifactDirectory: '/artifacts' },
        { analysisId: 'si-other', status: 'completed', report: { ...report, analysisId: 'si-other' } },
      ],
    }
    const { container, root } = await renderInteractive(viewProps(insight, runCommand))

    await click(button(container, 'Clear all'))
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('all 2 analyses')
    expect(dialog?.textContent).toContain('does not revert applied Skill changes')
    await click(button(container, 'Confirm clear all'))
    expect(runCommand).toHaveBeenCalledWith('/skill-insight clear --all --confirm')
    await act(async () => root.unmount())
  })
})
