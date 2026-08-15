import type { CommandRowProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

import { decodeInsightCommandResult } from '../shared/envelope.js'
import { parseSkillInsightCommand } from '../host/command.js'

const CSS = `
.si-command-card{display:flex;align-items:center;gap:9px;min-height:34px;padding:7px 10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:9px;background:color-mix(in srgb,currentColor 4%,transparent);font:12px/1.4 var(--vscode-font-family,Inter,system-ui,sans-serif)}
.si-command-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#5b8cff;box-shadow:0 0 0 3px color-mix(in srgb,#5b8cff 15%,transparent)}
.si-command-card[data-state=success] .si-command-dot{background:#3ccf91;box-shadow:none}.si-command-card[data-state=error] .si-command-dot{background:#f26d78;box-shadow:none}
.si-command-name{font-weight:700}.si-command-summary{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72}.si-command-separator{opacity:.3}
`

function compact(value: string): string {
  const oneLine = value.replace(/\s*\n\s*/gu, ' · ').trim()
  return oneLine.length > 240 ? `${oneLine.slice(0, 237)}…` : oneLine
}

/** Compact renderer keeps the durable JSON result out of the chat transcript. */
export function SkillInsightCommandCard({ node }: CommandRowProps) {
  try {
    const command = parseSkillInsightCommand(node.args ?? '')
    if ('origin' in command && command.origin === 'ui') return null
  } catch {
    // Malformed commands remain visible so failures are still diagnosable.
  }
  const state = node.outcome === null ? 'running' : node.outcome.kind
  const envelope = decodeInsightCommandResult(node.outcome?.text)
  const summary = node.outcome === null
    ? 'Analyzing the frozen trace…'
    : envelope?.message ?? compact(node.outcome.text ?? (state === 'error' ? 'Command failed.' : 'Command completed.'))
  return <div className="si-command-card" data-state={state} aria-live="polite">
    <style>{CSS}</style>
    <span className="si-command-dot" aria-hidden />
    <span className="si-command-name">Skill Insight</span>
    <span className="si-command-separator" aria-hidden>·</span>
    <span className="si-command-summary" title={summary}>{summary}</span>
  </div>
}
