// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SkillInsightAnalysisForm } from '../../src/client/SkillInsightAnalysisForm.js'
import type { SkillInsightActions, SkillOption } from '../../src/client/actions.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const catalog: readonly SkillOption[] = [
  { name: 'trace-review', description: 'Review an agent trace.', modelInvocable: true },
  { name: 'release-notes', description: 'Prepare a product launch.', modelInvocable: true },
]

function actions(overrides: Partial<SkillInsightActions> = {}): SkillInsightActions {
  return {
    loadSkills: async () => catalog,
    analyze: async () => {},
    apply: async () => {},
    revert: async () => {},
    clear: async () => {},
    clearAll: async () => {},
    ...overrides,
  }
}

async function renderForm(input: {
  detectedSkillNames?: readonly string[]
  actions?: SkillInsightActions
  onCompleted?: () => void
} = {}): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(SkillInsightAnalysisForm, {
      detectedSkillNames: input.detectedSkillNames ?? [],
      actions: input.actions ?? actions(),
      ...(input.onCompleted === undefined ? {} : { onCompleted: input.onCompleted }),
    }))
    await Promise.resolve()
  })
  return { container, root }
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const value = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === label)
  if (!(value instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`)
  return value
}

async function click(target: HTMLButtonElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

async function search(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('SkillInsightAnalysisForm', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
    document.body.replaceChildren()
  })

  test('loads installed Skills and auto-selects the only current-session Skill', async () => {
    const loadSkills = vi.fn(async () => catalog)
    const { container, root } = await renderForm({
      detectedSkillNames: ['trace-review'],
      actions: actions({ loadSkills }),
    })

    expect(loadSkills).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('Current session')
    expect(container.textContent).toContain('All installed Skills')
    expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent)
      .toContain('trace-review')
    await act(async () => root.unmount())
  })

  test('filters the installed Skill selector by searchable catalog content', async () => {
    const { container, root } = await renderForm()
    const input = container.querySelector('input[aria-label="Search Skills"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('Search input not found')

    await search(input, 'launch')

    expect(container.textContent).toContain('release-notes')
    expect(container.textContent).not.toContain('trace-review')
    await act(async () => root.unmount())
  })

  test('requires a Skill choice when several current-session Skills were detected', async () => {
    const { container, root } = await renderForm({
      detectedSkillNames: ['trace-review', 'release-notes'],
    })
    const start = button(container, 'Start analysis')

    expect(start.disabled).toBe(true)
    await click(button(container, 'trace-reviewReview an agent trace.'))
    expect(start.disabled).toBe(false)
    await act(async () => root.unmount())
  })

  test('submits one typed analysis with Hybrid as the default and blocks duplicates', async () => {
    let finish: (() => void) | undefined
    const analyze = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const completed = vi.fn()
    const { container, root } = await renderForm({
      detectedSkillNames: ['trace-review'],
      actions: actions({ analyze }),
      onCompleted: completed,
    })
    const start = button(container, 'Start analysis')

    expect(button(container, 'Hybrid').getAttribute('aria-pressed')).toBe('true')
    await click(start)
    await click(start)
    expect(analyze).toHaveBeenCalledOnce()
    expect(analyze).toHaveBeenCalledWith({ skillName: 'trace-review', mode: 'hybrid' })
    expect(button(container, 'Analyzing…').disabled).toBe(true)

    await act(async () => { finish?.(); await Promise.resolve() })
    expect(completed).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })

  test('keeps Auto-detect usable when catalog loading fails and supports retry', async () => {
    const loadSkills = vi.fn()
      .mockRejectedValueOnce(new Error('Catalog offline'))
      .mockResolvedValueOnce(catalog)
    const { container, root } = await renderForm({ actions: actions({ loadSkills }) })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Catalog offline')
    expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent)
      .toContain('Auto-detect')
    expect(button(container, 'Start analysis').disabled).toBe(false)

    await click(button(container, 'Retry'))
    expect(loadSkills).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('release-notes')
    await act(async () => root.unmount())
  })

  test('shows an actionable inline error when analysis fails', async () => {
    const { container, root } = await renderForm({
      actions: actions({ analyze: async () => { throw new Error('Trace unavailable') } }),
    })

    await click(button(container, 'Start analysis'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Trace unavailable')
    expect(button(container, 'Start analysis').disabled).toBe(false)
    await act(async () => root.unmount())
  })
})
