import { describe, expect, test } from 'vitest'

import {
  groupSkillChoices,
  initialSkillSelection,
} from '../../src/client/analysisFormModel.js'
import type { SkillOption } from '../../src/client/actions.js'

const catalog: readonly SkillOption[] = [
  {
    name: 'release-notes',
    description: 'Draft release notes.',
    whenToUse: 'When preparing a launch.',
    modelInvocable: true,
  },
  {
    name: 'trace-review',
    description: 'Review an agent trace.',
    whenToUse: 'When tool recovery is weak.',
    modelInvocable: true,
  },
  {
    name: 'release-notes',
    description: 'Duplicate catalog row.',
    modelInvocable: true,
  },
]

describe('Skill analysis form model', () => {
  test('defaults zero detections to Auto-detect and one detection to that Skill', () => {
    expect(initialSkillSelection([])).toEqual({ kind: 'auto' })
    expect(initialSkillSelection(['trace-review'])).toEqual({
      kind: 'skill',
      name: 'trace-review',
    })
  })

  test('requires an explicit choice when several Skills were detected', () => {
    expect(initialSkillSelection(['trace-review', 'release-notes'])).toBeNull()
  })

  test('prioritizes detected Skills and deduplicates the installed catalog', () => {
    const grouped = groupSkillChoices(['trace-review'], catalog, '')

    expect(grouped.session.map((choice) => choice.name)).toEqual(['trace-review'])
    expect(grouped.installed.map((choice) => choice.name)).toEqual(['release-notes'])
    expect(grouped.session[0]).toMatchObject({ detected: true, installed: true })
  })

  test('searches Skill name, description, and routing guidance case-insensitively', () => {
    expect(groupSkillChoices([], catalog, 'TRACE').installed.map((choice) => choice.name)).toEqual([
      'trace-review',
    ])
    expect(groupSkillChoices([], catalog, 'launch').installed.map((choice) => choice.name)).toEqual([
      'release-notes',
    ])
    expect(groupSkillChoices([], catalog, 'agent trace').installed.map((choice) => choice.name)).toEqual([
      'trace-review',
    ])
  })

  test('keeps a session-detected Skill selectable when it is absent from the catalog', () => {
    const grouped = groupSkillChoices(['local-only'], catalog, '')

    expect(grouped.session).toEqual([{
      name: 'local-only',
      description: 'Used in the current session.',
      modelInvocable: true,
      detected: true,
      installed: false,
    }])
  })
})
