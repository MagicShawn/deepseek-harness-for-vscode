import type { AnalysisMode } from '../shared/types.js'

export const COMMAND_USAGE = [
  'Usage:',
  '/skill-insight analyze [--skill <name>] [--mode hybrid|rules]',
  '/skill-insight apply <analysis-id>',
  '/skill-insight revert <analysis-id>',
  '/skill-insight clear <analysis-id>',
  '/skill-insight clear --all --confirm',
  '/skill-insight show [analysis-id]',
  '/skill-insight list',
].join('\n')

export type SkillInsightCommand =
  | { action: 'analyze'; mode: AnalysisMode; skillName?: string; origin?: 'ui' }
  | { action: 'apply'; analysisId: string; origin?: 'ui' }
  | { action: 'revert'; analysisId: string; origin?: 'ui' }
  | { action: 'clear'; scope: 'analysis'; analysisId: string; origin?: 'ui' }
  | { action: 'clear'; scope: 'session'; origin?: 'ui' }
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

function extractUiOrigin(tokens: string[]): { tokens: string[]; origin?: 'ui' } {
  const positions = tokens.flatMap((token, index) => token === '--origin' ? [index] : [])
  if (positions.length === 0) return { tokens }
  const position = positions[0]!
  if (positions.length !== 1 || position !== tokens.length - 2 || tokens[position + 1] !== 'ui') {
    fail('Expected a single trailing --origin ui marker.')
  }
  return { tokens: tokens.slice(0, -2), origin: 'ui' }
}

function analysisCommand(tokens: string[], origin?: 'ui'): SkillInsightCommand {
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
  return {
    action: 'analyze',
    mode,
    ...(skillName === undefined ? {} : { skillName }),
    ...(origin === undefined ? {} : { origin }),
  }
}

export function parseSkillInsightCommand(rawInput: string): SkillInsightCommand {
  const parsed = extractUiOrigin(tokenize(rawInput))
  const tokens = parsed.tokens
  const origin = parsed.origin
  const action = tokens[0]
  if (!action) fail('A subcommand is required.')
  if (action === 'analyze') return analysisCommand(tokens, origin)
  if (origin && action !== 'apply' && action !== 'revert' && action !== 'clear') {
    fail(`The UI origin is not valid for ${action}.`)
  }
  if (action === 'list' && tokens.length === 1) return { action: 'list' }
  if (action === 'show' && tokens.length <= 2) {
    return tokens[1] ? { action: 'show', analysisId: tokens[1] } : { action: 'show' }
  }
  if ((action === 'apply' || action === 'revert') && tokens.length === 2) {
    return { action, analysisId: tokens[1]!, ...(origin === undefined ? {} : { origin }) }
  }
  if (action === 'clear') {
    if (tokens.length === 2 && tokens[1] === '--all') {
      fail('Clearing all current-session analyses requires --confirm.')
    }
    if (tokens.length === 2 && tokens[1] && !tokens[1].startsWith('--')) {
      return {
        action: 'clear',
        scope: 'analysis',
        analysisId: tokens[1],
        ...(origin === undefined ? {} : { origin }),
      }
    }
    if (tokens.length === 3 && tokens[1] === '--all' && tokens[2] === '--confirm') {
      return { action: 'clear', scope: 'session', ...(origin === undefined ? {} : { origin }) }
    }
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
