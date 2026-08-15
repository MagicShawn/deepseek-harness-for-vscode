import { describe, expect, test } from 'vitest'

import { parseSkillInsightCommand, selectSkillName } from '../../src/host/command.js'

describe('skill-insight command grammar', () => {
  test('parses analyze flags in either order', () => {
    expect(parseSkillInsightCommand(' analyze --mode rules --skill demo-skill')).toEqual({
      action: 'analyze',
      mode: 'rules',
      skillName: 'demo-skill',
    })
    expect(parseSkillInsightCommand('analyze --skill "demo-skill"')).toEqual({
      action: 'analyze',
      mode: 'hybrid',
      skillName: 'demo-skill',
    })
  })

  test('parses lifecycle and inspection commands', () => {
    expect(parseSkillInsightCommand('apply si-123')).toEqual({ action: 'apply', analysisId: 'si-123' })
    expect(parseSkillInsightCommand('revert si-123')).toEqual({ action: 'revert', analysisId: 'si-123' })
    expect(parseSkillInsightCommand('show')).toEqual({ action: 'show' })
    expect(parseSkillInsightCommand('list')).toEqual({ action: 'list' })
  })

  test('parses explicitly confirmed cleanup commands', () => {
    expect(parseSkillInsightCommand('clear si-123')).toEqual({
      action: 'clear',
      scope: 'analysis',
      analysisId: 'si-123',
    })
    expect(parseSkillInsightCommand('clear --all --confirm')).toEqual({
      action: 'clear',
      scope: 'session',
    })
  })

  test('requires confirmation for session cleanup and rejects ambiguous cleanup arguments', () => {
    expect(() => parseSkillInsightCommand('clear --all')).toThrow(/--confirm/)
    expect(() => parseSkillInsightCommand('clear --confirm --all')).toThrow(/Usage/)
    expect(() => parseSkillInsightCommand('clear si-123 extra')).toThrow(/Usage/)
  })

  test('rejects unknown flags and missing arguments', () => {
    expect(() => parseSkillInsightCommand('analyze --auto')).toThrow(/Usage/)
    expect(() => parseSkillInsightCommand('apply')).toThrow(/Usage/)
  })
})

describe('selectSkillName', () => {
  test('uses an explicit Skill or the only detected invocation', () => {
    expect(selectSkillName('chosen-skill', ['one', 'two'])).toBe('chosen-skill')
    expect(selectSkillName(undefined, ['only-skill'])).toBe('only-skill')
  })

  test('requires a choice for zero or multiple detected Skills', () => {
    expect(() => selectSkillName(undefined, [])).toThrow(/--skill/)
    expect(() => selectSkillName(undefined, ['one', 'two'])).toThrow(/one, two/)
  })
})
