/** DeepSeek Harness host plugin: explicit trace analysis and safe Skill updates. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-skill'

import { SkillInsightController } from './host/controller.js'

export const name = 'skill-insight'
export const inject = ['commands', 'skills', 'llm']

export function apply(ctx: Context): void {
  const controller = new SkillInsightController({ skills: ctx.skills, llm: ctx.llm })
  ctx.effect(() => ctx.commands.register({
    name: 'skill-insight',
    description: 'analyze this session trace and propose an evidence-backed Skill update',
    input: { hint: 'analyze|apply|revert|show|list …' },
    recordInput: true,
    handler: invocation => controller.execute(invocation),
  }), 'skill-insight: command')
}

export * from './shared/index.js'
