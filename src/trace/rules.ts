import type {
  InsightIssue,
  NormalizedEvent,
  NormalizedTrace,
  RulesAnalysis,
  TraceEvidence,
} from '../shared/types.js'

export interface RuleOptions {
  selectedSkill: string
}

function evidence(event: NormalizedEvent): TraceEvidence {
  return { seq: event.seq, type: event.type, summary: event.summary }
}

function issue(
  input: Omit<InsightIssue, 'source'>,
): InsightIssue {
  return { ...input, source: 'rules' }
}

export function analyzeWithRules(
  trace: NormalizedTrace,
  options: RuleOptions,
): RulesAnalysis {
  const issues: InsightIssue[] = []
  const calls = trace.events.filter((event) => event.type === 'tool/call')
  const errors = trace.events.filter((event) => event.type === 'tool/result' && event.isError)
  const callsBySignature = new Map<string, NormalizedEvent[]>()

  for (const call of calls) {
    const signature = `${call.toolName ?? ''}\n${call.toolArguments ?? ''}`
    const group = callsBySignature.get(signature) ?? []
    group.push(call)
    callsBySignature.set(signature, group)
  }

  const repeated = [...callsBySignature.values()].filter((group) => group.length > 1)
  if (repeated.length > 0) {
    issues.push(
      issue({
        code: 'repeated-tool-call',
        severity: 'warning',
        title: 'Repeated tool calls',
        explanation: 'The trace repeats identical tool calls, which suggests the Skill did not make progress conditions explicit.',
        recommendation: 'Add a check-before-retry rule and require the agent to change inputs or strategy after an unchanged result.',
        evidence: repeated.flatMap((group) => group.slice(0, 3).map(evidence)).slice(0, 8),
      }),
    )
  }

  if (errors.length > 0) {
    issues.push(
      issue({
        code: 'tool-error',
        severity: 'critical',
        title: 'Tool failures occurred',
        explanation: 'One or more tool executions failed during the analyzed trace.',
        recommendation: 'Document expected failure modes and a concrete fallback path in the Skill.',
        evidence: errors.slice(0, 6).map(evidence),
      }),
    )

    const withoutRecovery = errors.filter(
      (error) =>
        !trace.events.some(
          (event) =>
            event.seq > error.seq &&
            event.seq <= error.seq + 3 &&
            event.type === 'tool/call' &&
            event.toolName !== 'skill',
        ),
    )
    if (withoutRecovery.length > 0) {
      issues.push(
        issue({
          code: 'missing-recovery',
          severity: 'warning',
          title: 'No recovery action followed a failure',
          explanation: 'A failed tool result was not followed by a different corrective tool action.',
          recommendation: 'Add an explicit error-recovery branch with a stop condition and escalation guidance.',
          evidence: withoutRecovery.slice(0, 6).map(evidence),
        }),
      )
    }
  }

  const matchingSkillCalls = trace.events.filter(
    (event) => event.skillName === options.selectedSkill,
  )
  if (matchingSkillCalls.length === 0) {
    issues.push(
      issue({
        code: 'skill-not-invoked',
        severity: 'warning',
        title: 'Selected Skill was not invoked',
        explanation: `The trace contains no invocation of ${options.selectedSkill}.`,
        recommendation: 'Analyze a session that invoked this Skill or choose one of the detected Skills.',
        evidence: [
          {
            seq: trace.cutoffSeq,
            type: 'trace/cutoff',
            summary: `No ${options.selectedSkill} invocation before cutoff ${trace.cutoffSeq}.`,
          },
        ],
      }),
    )
  } else if (trace.events.length > 1) {
    const firstIndex = trace.events.indexOf(matchingSkillCalls[0]!)
    if (firstIndex / (trace.events.length - 1) >= 0.6) {
      issues.push(
        issue({
          code: 'late-skill-invocation',
          severity: 'info',
          title: 'Skill was invoked late',
          explanation: 'Most of the recorded work occurred before the selected Skill was loaded.',
          recommendation: 'Clarify trigger wording so the Skill is selected before exploratory tool calls begin.',
          evidence: matchingSkillCalls.slice(0, 3).map(evidence),
        }),
      )
    }
  }

  const summary = issues.length === 0
    ? 'No deterministic trace problems were detected.'
    : `${issues.length} evidence-backed trace issue${issues.length === 1 ? '' : 's'} detected.`

  return { summary, issues, metrics: trace.metrics }
}
