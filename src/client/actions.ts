import type { AnalysisMode } from '../shared/types.js'
import type { IApiClient, SessionId } from '@deepseek-ai/dsh-client-connection/client'

export interface SkillOption {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
}

export interface SkillInsightActions {
  loadSkills(): Promise<readonly SkillOption[]>
  analyze(input: { skillName?: string; mode: AnalysisMode }): Promise<void>
  apply(analysisId: string): Promise<void>
  revert(analysisId: string): Promise<void>
  clear(analysisId: string): Promise<void>
  clearAll(): Promise<void>
}

export interface SkillInsightActionDependencies {
  runCommand(line: string): Promise<void>
  loadSkills(): Promise<readonly SkillOption[]>
}

export async function loadSkillOptions(
  api: Pick<IApiClient, 'skills'>,
  sessionId: SessionId,
): Promise<readonly SkillOption[]> {
  const response = await api.skills.list({ sessionId })
  if (!response.result.ok) {
    const { code, message } = response.result.error
    throw new Error(`Unable to load Skills: ${code}: ${message}`)
  }
  return response.result.value.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    modelInvocable: skill.modelInvocable,
  }))
}

const COMMAND_TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u

function assertToken(value: string, label: string): void {
  if (!COMMAND_TOKEN.test(value)) throw new Error(`Invalid ${label}: ${value}`)
}

export function createSkillInsightActions(
  dependencies: SkillInsightActionDependencies,
): SkillInsightActions {
  const runForAnalysis = async (action: 'apply' | 'revert' | 'clear', analysisId: string) => {
    assertToken(analysisId, 'analysis id')
    await dependencies.runCommand(`/skill-insight ${action} ${analysisId} --origin ui`)
  }

  return {
    loadSkills: () => dependencies.loadSkills(),
    analyze: async ({ skillName, mode }) => {
      if (skillName !== undefined) assertToken(skillName, 'Skill name')
      const skill = skillName === undefined ? '' : ` --skill ${skillName}`
      await dependencies.runCommand(`/skill-insight analyze${skill} --mode ${mode} --origin ui`)
    },
    apply: (analysisId) => runForAnalysis('apply', analysisId),
    revert: (analysisId) => runForAnalysis('revert', analysisId),
    clear: (analysisId) => runForAnalysis('clear', analysisId),
    clearAll: async () => {
      await dependencies.runCommand('/skill-insight clear --all --confirm --origin ui')
    },
  }
}
