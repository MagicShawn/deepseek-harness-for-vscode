/** DeepSeek Harness browser plugin: Skill Insight conversation view. */
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { SkillInsightView, type SkillInsightViewInjected } from './SkillInsightView.js'
import { SkillInsightCommandCard } from './SkillInsightCommandCard.js'
import { registerInsightProjection } from './projection.js'
import { createSkillInsightActions, loadSkillOptions } from './actions.js'

export const inject = ['slots', 'conversationEvents', 'conversationViews', 'sessions', 'connection']

export function apply(ctx: Context): void {
  registerInsightProjection(ctx)
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
    name: 'conversation.chat.commandview',
    key: 'skill-insight',
  }, SkillInsightCommandCard))
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'skill-insight',
    order: 20,
    label: 'Skill Insight',
    inject: (sessionId: SessionId): SkillInsightViewInjected => {
      // Host and Client Context declarations coexist in this package's declaration build.
      const sessions = ctx.sessions as unknown as ISessions
      const connection = (ctx as unknown as { connection: ConnectionHandle }).connection
      const session = sessions.binding(sessionId)?.session
      if (!session) throw new Error(`skill-insight: session "${sessionId}" is unavailable`)
      return {
        actions: createSkillInsightActions({
          loadSkills: () => loadSkillOptions(connection.api, sessionId),
          runCommand: async (line: string) => {
            const result = await session.command(line)
            if (!result.ok) {
              throw new Error(`Skill Insight command failed: ${result.error.code}: ${result.error.message}`)
            }
            if (!result.value.matched) throw new Error('The Host does not expose /skill-insight.')
          },
        }),
      }
    },
  }, SkillInsightView))
}
