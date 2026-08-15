import type { AnalysisMode } from '../shared/types.js'

export const COMMAND_USAGE = [
  'Usage:',
  '/skill-insight analyze [--skill <name>] [--mode hybrid|rules]',
  '/skill-insight apply <analysis-id>',
  '/skill-insight revert <analysis-id>',
  '/skill-insight show [analysis-id]',
  '/skill-insight list',
].join('\n')

export type SkillInsightCommand =
  | { action: 'analyze'; mode: AnalysisMode; skillName?: string }
  | { action: 'apply'; analysisId: string }
  | { action: 'revert'; analysisId: string }
  | { action: 'show'; analysisId?: string }
  | { action: 'list' }

function fail(message: string): never {
  throw new Error(`${message}\n${COMMAND_USAGE}`)
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const character of input.trim()) {
    if (escaped) {
      token += character
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else token += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }
    token += character
  }
  if (escaped || quote) fail('Unterminated quoted input.')
  if (token) tokens.push(token)
  return tokens
}

function analysisCommand(tokens: string[]): SkillInsightCommand {
  let mode: AnalysisMode = 'hybrid'
  let skillName: string | undefined
  for (let index = 1; index < tokens.length; index += 1) {
    const flag = tokens[index]
    const value = tokens[index + 1]
    if (flag === '--mode') {
      if (value !== 'hybrid' && value !== 'rules') fail('Expected --mode hybrid or --mode rules.')
      mode = value
      index += 1
      continue
    }
    if (flag === '--skill') {
      if (!value || value.startsWith('--')) fail('Expected a Skill name after --skill.')
      skillName = value
      index += 1
      continue
    }
    fail(`Unknown analyze option: ${flag ?? ''}`)
  }
  return skillName ? { action: 'analyze', mode, skillName } : { action: 'analyze', mode }
}

export function parseSkillInsightCommand(rawInput: string): SkillInsightCommand {
  const tokens = tokenize(rawInput)
  const action = tokens[0]
  if (!action) fail('A subcommand is required.')
  if (action === 'analyze') return analysisCommand(tokens)
  if (action === 'list' && tokens.length === 1) return { action: 'list' }
  if (action === 'show' && tokens.length <= 2) {
    return tokens[1] ? { action: 'show', analysisId: tokens[1] } : { action: 'show' }
  }
  if ((action === 'apply' || action === 'revert') && tokens.length === 2) {
    return { action, analysisId: tokens[1]! }
  }
  fail(`Invalid ${action} arguments.`)
}

export function selectSkillName(
  explicit: string | undefined,
  invokedSkills: readonly string[],
): string {
  if (explicit) return explicit
  if (invokedSkills.length === 1) return invokedSkills[0]!
  if (invokedSkills.length === 0) {
    throw new Error('No Skill invocation was detected. Pass --skill <name>.')
  }
  throw new Error(`Multiple Skills were detected (${invokedSkills.join(', ')}). Pass --skill <name>.`)
}
