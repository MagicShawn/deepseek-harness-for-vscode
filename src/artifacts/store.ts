import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

import type {
  InsightReport,
  NormalizedTrace,
  SkillSourceSnapshot,
} from '../shared/types.js'
import { snapshotSkillContent } from '../skill/file.js'

export interface AnalysisArtifacts {
  report: InsightReport
  trace: NormalizedTrace
  skill: SkillSourceSnapshot
}

export type RestoredAnalysis = AnalysisArtifacts

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
    const root = resolve(this.root)
    const directory = resolve(root, safeSegment(sessionId), safeSegment(analysisId))
    const relativePath = relative(root, directory)
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Skill Insight artifact path escaped the configured root.')
    }
    return directory
  }

  async removeAnalysis(sessionId: string, analysisId: string): Promise<boolean> {
    const directory = this.directoryFor(sessionId, analysisId)
    let sessionStats
    try {
      sessionStats = await lstat(dirname(directory))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
    if (sessionStats.isSymbolicLink()) {
      throw new Error('Refusing to remove artifacts through a symbolic-link session directory.')
    }
    if (!sessionStats.isDirectory()) {
      throw new Error('Refusing to remove artifacts through a session path that is not a directory.')
    }
    let stats
    try {
      stats = await lstat(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
    if (stats.isSymbolicLink()) {
      throw new Error('Refusing to remove a symbolic-link artifact directory.')
    }
    if (!stats.isDirectory()) {
      throw new Error('Refusing to remove an artifact path that is not a directory.')
    }
    await rm(directory, { recursive: true, force: true })
    return true
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

  async readAnalysis(sessionId: string, analysisId: string): Promise<RestoredAnalysis> {
    const directory = this.directoryFor(sessionId, analysisId)
    const [reportText, traceText, rawContent] = await Promise.all([
      readFile(join(directory, 'report.json'), 'utf8'),
      readFile(join(directory, 'trace.normalized.json'), 'utf8'),
      readFile(join(directory, 'snapshots', 'SKILL.before.md'), 'utf8'),
    ])
    const report = JSON.parse(reportText) as InsightReport
    const trace = JSON.parse(traceText) as NormalizedTrace
    if (report.schemaVersion !== 1 || report.analysisId !== analysisId || report.sessionId !== sessionId) {
      throw new Error('Stored Skill Insight report identity does not match the requested analysis.')
    }
    const skill = snapshotSkillContent(report.skill, rawContent)
    if (report.proposal && skill.baselineHash !== report.proposal.beforeHash) {
      throw new Error('Stored Skill snapshot hash does not match the proposal baseline.')
    }
    return { report, trace, skill }
  }
}
