export type AnalysisMode = 'rules' | 'hybrid'

export type InsightSeverity = 'info' | 'warning' | 'critical'

export interface TraceMetrics {
  totalEvents: number
  toolCalls: number
  toolErrors: number
  repeatedToolCalls: number
  recoveryAttempts: number
}

export interface NormalizedEvent {
  seq: number
  time: number
  type: string
  summary: string
  toolName?: string
  toolArguments?: string
  skillName?: string
  isError?: boolean
}

export interface NormalizedTrace {
  cutoffSeq: number
  events: NormalizedEvent[]
  invokedSkills: string[]
  truncatedEvents: number
  metrics: TraceMetrics
}

export interface TraceEvidence {
  seq: number
  type: string
  summary: string
}

export interface InsightIssue {
  code: string
  severity: InsightSeverity
  title: string
  explanation: string
  recommendation: string
  evidence: TraceEvidence[]
  source: 'rules' | 'model'
}

export interface RulesAnalysis {
  summary: string
  issues: InsightIssue[]
  metrics: TraceMetrics
}

export interface SkillIdentity {
  name: string
  path: string
  provider: string
}

export interface SkillSourceSnapshot extends SkillIdentity {
  rawContent: string
  frontmatter: string
  body: string
  newline: '\n' | '\r\n'
  baselineHash: string
}

export interface SkillProposal {
  revisedContent: string
  unifiedDiff: string
  beforeHash: string
  afterHash: string
}

export interface InsightValidation {
  code: string
  ok: boolean
  message: string
}

export interface InsightReport {
  schemaVersion: 1
  analysisId: string
  sessionId: string
  cutoffSeq: number
  createdAt: string
  requestedMode: AnalysisMode
  effectiveMode: AnalysisMode
  skill: SkillIdentity
  summary: string
  metrics: TraceMetrics
  issues: InsightIssue[]
  proposal: SkillProposal | null
  validations: InsightValidation[]
  warnings: string[]
}

export type InsightRunStatus = 'running' | 'completed' | 'failed' | 'applied' | 'reverted'

export interface InsightRunView {
  analysisId: string
  status: InsightRunStatus
  skillName?: string
  requestedMode?: AnalysisMode
  cutoffSeq?: number
  report?: InsightReport
  artifactDirectory?: string
  error?: string
}

export interface InsightViewSnapshot {
  latestAnalysisId: string | null
  runs: InsightRunView[]
  detectedSkillNames: string[]
}
