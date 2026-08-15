import type { SkillOption } from './actions.js'

export type SkillSelection =
  | { kind: 'auto' }
  | { kind: 'skill'; name: string }
  | null

export interface SkillChoice extends SkillOption {
  readonly detected: boolean
  readonly installed: boolean
}

export interface SkillChoiceGroups {
  readonly session: readonly SkillChoice[]
  readonly installed: readonly SkillChoice[]
}

export function initialSkillSelection(detectedSkillNames: readonly string[]): SkillSelection {
  if (detectedSkillNames.length === 0) return { kind: 'auto' }
  if (detectedSkillNames.length === 1) {
    return { kind: 'skill', name: detectedSkillNames[0]! }
  }
  return null
}

function matches(choice: SkillChoice, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return true
  return [choice.name, choice.description, choice.whenToUse ?? '']
    .some((value) => value.toLocaleLowerCase().includes(query))
}

export function groupSkillChoices(
  detectedSkillNames: readonly string[],
  catalog: readonly SkillOption[],
  query: string,
): SkillChoiceGroups {
  const catalogByName = new Map<string, SkillOption>()
  for (const skill of catalog) {
    if (!catalogByName.has(skill.name)) catalogByName.set(skill.name, skill)
  }
  const detected = new Set(detectedSkillNames)
  const session = detectedSkillNames.map((name): SkillChoice => {
    const skill = catalogByName.get(name)
    return skill
      ? { ...skill, detected: true, installed: true }
      : {
        name,
        description: 'Used in the current session.',
        modelInvocable: true,
        detected: true,
        installed: false,
      }
  }).filter((choice) => matches(choice, query))
  const installed = [...catalogByName.values()]
    .filter((skill) => !detected.has(skill.name))
    .map((skill): SkillChoice => ({ ...skill, detected: false, installed: true }))
    .filter((choice) => matches(choice, query))
  return { session, installed }
}
