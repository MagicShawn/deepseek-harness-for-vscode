import type {
  InsightIssue,
  InsightSeverity,
  NormalizedTrace,
  TraceEvidence,
} from '../shared/types.js'

export interface ModelAnalysisResult {
  summary: string
  issues: InsightIssue[]
  revisedSkillContent: string
}

export interface ModelAnalysisOutput {
  result: ModelAnalysisResult | null
  warning?: string
}

export interface ModelRequest {
  system: string
  prompt: string
  maxTokens: number
}

export interface ModelChunk {
  type: string
  text?: unknown
  reason?: unknown
  [key: string]: unknown
}

export interface ModelAnalysisOptions {
  trace: NormalizedTrace
  skillName: string
  skillContent: string
  stream: (request: ModelRequest) => AsyncIterable<ModelChunk>
}

interface RawIssue {
  code?: unknown
  severity?: unknown
  title?: unknown
  explanation?: unknown
  recommendation?: unknown
  evidenceSeqs?: unknown
}

function stringValue(value: unknown, fallback: string, limit = 2_000): string {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.trim().slice(0, limit)
}

function severity(value: unknown): InsightSeverity {
  return value === 'info' || value === 'warning' || value === 'critical'
    ? value
    : 'warning'
}

function code(value: unknown, index: number): string {
  const candidate = stringValue(value, `model-issue-${index + 1}`, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return candidate || `model-issue-${index + 1}`
}

function evidenceFor(raw: RawIssue, trace: NormalizedTrace): TraceEvidence[] {
  const requested = Array.isArray(raw.evidenceSeqs)
    ? raw.evidenceSeqs.filter((value): value is number => Number.isInteger(value))
    : []
  const requestedSet = new Set(requested)
  return trace.events
    .filter((event) => requestedSet.has(event.seq))
    .slice(0, 8)
    .map((event) => ({ seq: event.seq, type: event.type, summary: event.summary }))
}

function parseJson(text: string): unknown {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('response did not contain a JSON object')
  return JSON.parse(withoutFence.slice(start, end + 1))
}

function normalizeResult(value: unknown, trace: NormalizedTrace): ModelAnalysisResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('response JSON must be an object')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.issues)) throw new Error('response JSON must include issues[]')
  const revisedSkillContent = stringValue(record.revisedSkillContent, '', 120_000)
  if (!revisedSkillContent) throw new Error('response JSON must include revisedSkillContent')

  const issues = record.issues.slice(0, 12).map((value, index) => {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as RawIssue)
      : {}
    return {
      code: code(raw.code, index),
      severity: severity(raw.severity),
      title: stringValue(raw.title, `Model issue ${index + 1}`, 160),
      explanation: stringValue(raw.explanation, 'No explanation supplied.', 1_200),
      recommendation: stringValue(raw.recommendation, 'Review the Skill instructions.', 1_200),
      evidence: evidenceFor(raw, trace),
      source: 'model' as const,
    }
  })

  return {
    summary: stringValue(record.summary, 'Model analysis completed.', 1_200),
    issues,
    revisedSkillContent,
  }
}

function promptFor(options: ModelAnalysisOptions): ModelRequest {
  return {
    system: [
      'You analyze a DeepSeek Harness execution trace to improve exactly one Skill.',
      'Use only supplied evidence. Do not invent tools, outcomes, or capabilities.',
      'Return only JSON with summary, issues, and revisedSkillContent.',
      'Each issue must contain code, severity, title, explanation, recommendation, evidenceSeqs.',
      'revisedSkillContent is the complete Markdown body only; never include YAML frontmatter.',
    ].join(' '),
    prompt: JSON.stringify({
      skill: { name: options.skillName, content: options.skillContent },
      normalizedTrace: options.trace,
    }),
    maxTokens: 8_000,
  }
}

export async function analyzeWithModel(
  options: ModelAnalysisOptions,
): Promise<ModelAnalysisOutput> {
  let text = ''
  try {
    for await (const chunk of options.stream(promptFor(options))) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text
        if (text.length > 160_000) throw new Error('model response exceeded the safety limit')
      }
      if (chunk.type === 'finish' && chunk.reason && typeof chunk.reason === 'object') {
        const reason = chunk.reason as {
          kind?: unknown
          failure?: { message?: unknown }
        }
        if (reason.kind === 'error' || reason.kind === 'aborted') {
          const failureMessage = typeof reason.failure?.message === 'string'
            ? reason.failure.message
            : `model call ${reason.kind}`
          throw new Error(failureMessage)
        }
      }
    }
    return { result: normalizeResult(parseJson(text), options.trace) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { result: null, warning: `Model analysis did not return valid JSON: ${message}` }
  }
}
