import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

import type {
  InsightReport,
  NormalizedTrace,
  SkillSourceSnapshot,
} from '../shared/types.js'

export interface AnalysisArtifacts {
  report: InsightReport
  trace: NormalizedTrace
  skill: SkillSourceSnapshot
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return safe || 'unknown'
}

function markdownReport(report: InsightReport): string {
  const issueSections = report.issues.map((issue) => {
    const evidence = issue.evidence
      .map((item) => `- \`#${item.seq} ${item.type}\`: ${item.summary}`)
      .join('\n')
    return [
      `## [${issue.severity.toUpperCase()}] ${issue.title}`,
      '',
      issue.explanation,
      '',
      `Recommendation: ${issue.recommendation}`,
      '',
      evidence || '- No matching normalized evidence was returned.',
    ].join('\n')
  })
  return [
    `# Skill Insight: ${report.skill.name}`,
    '',
    report.summary,
    '',
    `- Analysis: \`${report.analysisId}\``,
    `- Session: \`${report.sessionId}\``,
    `- Trace cutoff: \`${report.cutoffSeq}\``,
    `- Mode: \`${report.effectiveMode}\``,
    '',
    ...issueSections,
    '',
  ].join('\n')
}

export class ArtifactStore {
  constructor(private readonly root = dshHomePath('skill-insight')) {}

  directoryFor(sessionId: string, analysisId: string): string {
    return join(this.root, safeSegment(sessionId), safeSegment(analysisId))
  }

  async writeAnalysis(input: AnalysisArtifacts): Promise<string> {
    const directory = this.directoryFor(input.report.sessionId, input.report.analysisId)
    const snapshots = join(directory, 'snapshots')
    await mkdir(snapshots, { recursive: true })
    await Promise.all([
      writeFile(join(directory, 'report.json'), `${JSON.stringify(input.report, null, 2)}\n`, 'utf8'),
      writeFile(join(directory, 'report.md'), markdownReport(input.report), 'utf8'),
      writeFile(join(directory, 'trace.normalized.json'), `${JSON.stringify(input.trace, null, 2)}\n`, 'utf8'),
      writeFile(join(snapshots, 'SKILL.before.md'), input.skill.rawContent, 'utf8'),
    ])
    if (input.report.proposal) {
      await Promise.all([
        writeFile(join(directory, 'proposal.diff'), input.report.proposal.unifiedDiff, 'utf8'),
        writeFile(join(snapshots, 'SKILL.proposed.md'), input.report.proposal.revisedContent, 'utf8'),
      ])
    }
    return directory
  }
}
