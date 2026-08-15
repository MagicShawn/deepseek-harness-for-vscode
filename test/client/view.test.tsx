// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SkillInsightView, type SkillInsightViewInjected } from '../../src/client/SkillInsightView.js'
import { SkillInsightCommandCard } from '../../src/client/SkillInsightCommandCard.js'
import type { SkillInsightActions } from '../../src/client/actions.js'
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

function visualActions(overrides: Partial<SkillInsightActions> = {}): SkillInsightActions {
  return {
    loadSkills: async () => [],
    analyze: async () => {},
    apply: async () => {},
    revert: async () => {},
    clear: async () => {},
    clearAll: async () => {},
    ...overrides,
  }
}

function viewProps(insight: InsightViewSnapshot, actions = visualActions()) {
  const conversation = { views: new Map([['skill-insight', insight]]) }
  return {
    sessionId: 'session-ui',
    useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
    actions,
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

  test('hides valid visual actions but keeps manual and malformed command rows visible', () => {
    const node = {
      kind: 'command', seq: 43, time: 1, commandId: 'cmd-ui', name: 'skill-insight',
      args: ' analyze --skill demo-skill', outcome: null,
    }
    const manual = renderToStaticMarkup(createElement(SkillInsightCommandCard, { node } as never))
    const visual = renderToStaticMarkup(createElement(SkillInsightCommandCard, {
      node: { ...node, args: ' analyze --skill demo-skill --origin ui' },
    } as never))
    const malformed = renderToStaticMarkup(createElement(SkillInsightCommandCard, {
      node: { ...node, args: ' analyze --broken --origin ui' },
    } as never))

    expect(manual).toContain('Skill Insight')
    expect(visual).toBe('')
    expect(malformed).toContain('Skill Insight')
  })

  test('renders metrics, evidence, proposal diff, and apply action', () => {
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
      detectedSkillNames: [],
    }
    const conversation = { views: new Map([['skill-insight', insight]]) }
    const props = {
      sessionId: 'session-ui',
      useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
      actions: visualActions(),
    } as unknown as ConvViewProps & SkillInsightViewInjected

    const html = renderToStaticMarkup(createElement(SkillInsightView, props))

    expect(html).toContain('demo-skill')
    expect(html).toContain('42')
    expect(html).toContain('Missing recovery')
    expect(html).toContain('#17')
    expect(html).toContain('# New')
    expect(html).toContain('Apply proposal')
  })

  test('renders the full visual form in the empty state without a CLI example', () => {
    const conversation = { views: new Map() }
    const props = {
      sessionId: 'session-ui',
      useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
      actions: visualActions(),
    } as unknown as ConvViewProps & SkillInsightViewInjected

    const html = renderToStaticMarkup(createElement(SkillInsightView, props))

    expect(html).toContain('New analysis')
    expect(html).toContain('Start analysis')
    expect(html).not.toContain('/skill-insight analyze')
  })

  test('keeps the analysis form collapsed with history and expands it from New analysis', async () => {
    const loadSkills = vi.fn(async () => [{
      name: 'demo-skill', description: 'Analyze the demo trace.', modelInvocable: true,
    }])
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
      detectedSkillNames: ['demo-skill'],
    }
    const { container, root } = await renderInteractive(viewProps(
      insight,
      visualActions({ loadSkills }),
    ))

    expect(container.querySelector('input[aria-label="Search Skills"]')).toBeNull()
    await click(button(container, 'New analysis'))
    expect(container.querySelector('input[aria-label="Search Skills"]')).not.toBeNull()
    expect(loadSkills).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })

  test('collapses a history analysis form after a successful typed analysis', async () => {
    const analyze = vi.fn(async () => {})
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
      detectedSkillNames: ['demo-skill'],
    }
    const { container, root } = await renderInteractive(viewProps(
      insight,
      visualActions({ analyze }),
    ))

    await click(button(container, 'New analysis'))
    await click(button(container, 'Start analysis'))
    expect(analyze).toHaveBeenCalledWith({ skillName: 'demo-skill', mode: 'hybrid' })
    expect(container.querySelector('input[aria-label="Search Skills"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('selects a newly projected analysis result automatically', async () => {
    let insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [
        { analysisId: 'si-ui', status: 'completed', report },
        {
          analysisId: 'si-old',
          status: 'completed',
          report: { ...report, analysisId: 'si-old', skill: { ...report.skill, name: 'old-skill' } },
        },
      ],
      detectedSkillNames: [],
    }
    const conversation = { views: { get: () => insight } }
    const props = {
      sessionId: 'session-ui',
      useSession: (selector: (snapshot: typeof conversation) => unknown) => selector(conversation),
      actions: visualActions(),
    } as unknown as ConvViewProps & SkillInsightViewInjected
    const { container, root } = await renderInteractive(props)
    const old = [...container.querySelectorAll('.si-history-item')]
      .find((item) => item.textContent?.includes('old-skill'))
    if (!(old instanceof HTMLButtonElement)) throw new Error('Old analysis not found')
    await click(old)
    expect(old.dataset.active).toBe('true')

    insight = {
      ...insight,
      latestAnalysisId: 'si-new',
      runs: [
        { analysisId: 'si-new', status: 'running', skillName: 'new-skill' },
        ...insight.runs,
      ],
    }
    await act(async () => root.render(createElement(SkillInsightView, props)))

    const active = container.querySelector('.si-history-item[data-active="true"]')
    expect(active?.textContent).toContain('new-skill')
    await act(async () => root.unmount())
  })

  test('uses typed actions for applying and reverting proposals', async () => {
    const apply = vi.fn(async () => {})
    const revert = vi.fn(async () => {})
    const completed: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report }],
      detectedSkillNames: [],
    }
    let rendered = await renderInteractive(viewProps(completed, visualActions({ apply })))
    await click(button(rendered.container, 'Apply proposal'))
    expect(apply).toHaveBeenCalledWith('si-ui')
    await act(async () => rendered.root.unmount())

    const applied: InsightViewSnapshot = {
      ...completed,
      runs: [{ analysisId: 'si-ui', status: 'applied', report }],
    }
    rendered = await renderInteractive(viewProps(applied, visualActions({ revert })))
    await click(button(rendered.container, 'Revert change'))
    expect(revert).toHaveBeenCalledWith('si-ui')
    await act(async () => rendered.root.unmount())
  })

  test('requires confirmation before clearing one analysis and supports cancellation', async () => {
    const clear = vi.fn(async () => {})
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [{ analysisId: 'si-ui', status: 'completed', report, artifactDirectory: '/artifacts' }],
      detectedSkillNames: [],
    }
    const { container, root } = await renderInteractive(viewProps(insight, visualActions({ clear })))

    await click(button(container, 'Clear analysis'))
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Session history remains unchanged',
    )
    await click(button(container, 'Cancel'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(clear).not.toHaveBeenCalled()

    await click(button(container, 'Clear analysis'))
    await click(button(container, 'Confirm clear'))
    expect(clear).toHaveBeenCalledWith('si-ui')
    await act(async () => root.unmount())
  })

  test('uses the explicit confirmed command for clearing all current-session analyses', async () => {
    const clearAll = vi.fn(async () => {})
    const insight: InsightViewSnapshot = {
      latestAnalysisId: 'si-ui',
      runs: [
        { analysisId: 'si-ui', status: 'applied', report, artifactDirectory: '/artifacts' },
        { analysisId: 'si-other', status: 'completed', report: { ...report, analysisId: 'si-other' } },
      ],
      detectedSkillNames: [],
    }
    const { container, root } = await renderInteractive(viewProps(insight, visualActions({ clearAll })))

    await click(button(container, 'Clear all'))
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('all 2 analyses')
    expect(dialog?.textContent).toContain('does not revert applied Skill changes')
    await click(button(container, 'Confirm clear all'))
    expect(clearAll).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })
})
