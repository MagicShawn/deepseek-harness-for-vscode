import type { InsightReport } from './types.js'

const ENVELOPE_MARKER = '[[skill-insight:v1]]'
const MAX_ENVELOPE_LENGTH = 512 * 1024

export type InsightOperation = 'analyze' | 'apply' | 'revert' | 'command'

export type InsightCommandEnvelope =
  | {
    schemaVersion: 1
    type: 'completed'
    analysisId: string
    report: InsightReport
    artifactDirectory: string
    message: string
  }
  | {
    schemaVersion: 1
    type: 'failed'
    analysisId: string
    operation: InsightOperation
    message: string
  }
  | {
    schemaVersion: 1
    type: 'applied'
    analysisId: string
    skillName: string
    appliedHash: string
    message: string
  }
  | {
    schemaVersion: 1
    type: 'reverted'
    analysisId: string
    skillName: string
    restoredHash: string
    message: string
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasText(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string' && value[key].length > 0
}

/** Stable in browsers and Node; the readable suffix helps local artifact inspection. */
export function analysisIdForCommandId(commandId: unknown): string {
  const source = String(commandId)
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const suffix = source.replace(/[^a-zA-Z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(-48) || 'command'
  return `si-${(hash >>> 0).toString(36)}-${suffix}`
}

export function encodeInsightCommandResult(value: InsightCommandEnvelope): string {
  return `${ENVELOPE_MARKER}${JSON.stringify(value)}`
}

/** Parse only our bounded, versioned command result; normal command text is ignored. */
export function decodeInsightCommandResult(text: unknown): InsightCommandEnvelope | null {
  if (typeof text !== 'string' || text.length > MAX_ENVELOPE_LENGTH || !text.startsWith(ENVELOPE_MARKER)) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(text.slice(ENVELOPE_MARKER.length))
  } catch {
    return null
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !hasText(value, 'analysisId')
    || !hasText(value, 'message') || typeof value.type !== 'string') return null
  if (value.type === 'completed') {
    return isRecord(value.report) && hasText(value, 'artifactDirectory')
      ? value as unknown as InsightCommandEnvelope
      : null
  }
  if (value.type === 'failed') {
    return ['analyze', 'apply', 'revert', 'command'].includes(String(value.operation))
      ? value as unknown as InsightCommandEnvelope
      : null
  }
  if (value.type === 'applied') {
    return hasText(value, 'skillName') && hasText(value, 'appliedHash')
      ? value as unknown as InsightCommandEnvelope
      : null
  }
  if (value.type === 'reverted') {
    return hasText(value, 'skillName') && hasText(value, 'restoredHash')
      ? value as unknown as InsightCommandEnvelope
      : null
  }
  return null
}
