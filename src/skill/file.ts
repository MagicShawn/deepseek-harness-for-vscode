import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createTwoFilesPatch } from 'diff'

import type {
  SkillIdentity,
  SkillProposal,
  SkillSourceSnapshot,
} from '../shared/types.js'

export type SkillFileIdentity = SkillIdentity

export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function splitSkillContent(rawContent: string): {
  frontmatter: string
  body: string
  newline: '\n' | '\r\n'
} {
  const newline = rawContent.includes('\r\n') ? '\r\n' : '\n'
  const match = rawContent.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)
  return {
    frontmatter: match?.[0] ?? '',
    body: match ? rawContent.slice(match[0].length) : rawContent,
    newline,
  }
}

function normalizeNewlines(content: string, newline: '\n' | '\r\n'): string {
  return content.replace(/\r\n|\r|\n/g, newline)
}

export async function readSkillSnapshot(
  identity: SkillFileIdentity,
): Promise<SkillSourceSnapshot> {
  if (basename(identity.path).toLowerCase() !== 'skill.md') {
    throw new Error(`Refusing to modify ${identity.path}: expected a SKILL.md file.`)
  }
  const rawContent = await readFile(identity.path, 'utf8')
  return snapshotSkillContent(identity, rawContent)
}

export function snapshotSkillContent(
  identity: SkillFileIdentity,
  rawContent: string,
): SkillSourceSnapshot {
  const parts = splitSkillContent(rawContent)
  return {
    ...identity,
    rawContent,
    ...parts,
    baselineHash: contentHash(rawContent),
  }
}

export function createSkillProposal(
  snapshot: SkillSourceSnapshot,
  revisedBody: string,
): SkillProposal {
  if (!revisedBody.trim()) throw new Error('The revised Skill body is empty.')
  if (/^---\r?\n/.test(revisedBody)) {
    throw new Error('The proposal must contain only the Skill body, without YAML frontmatter.')
  }
  const normalizedBody = normalizeNewlines(revisedBody, snapshot.newline)
  const revisedContent = `${snapshot.frontmatter}${normalizedBody}`
  const beforeHash = snapshot.baselineHash
  const afterHash = contentHash(revisedContent)
  const unifiedDiff = createTwoFilesPatch(
    `${snapshot.name}/SKILL.md (current)`,
    `${snapshot.name}/SKILL.md (proposed)`,
    snapshot.rawContent,
    revisedContent,
    '',
    '',
    { context: 4 },
  )
  return { revisedContent, unifiedDiff, beforeHash, afterHash }
}

async function assertCurrentHash(path: string, expected: string, action: string): Promise<void> {
  const current = await readFile(path, 'utf8')
  if (contentHash(current) !== expected) {
    throw new Error(`The Skill changed after analysis; refusing to ${action}. Run a new analysis first.`)
  }
}

export async function applySkillProposal(
  snapshot: SkillSourceSnapshot,
  proposal: SkillProposal,
): Promise<void> {
  if (proposal.beforeHash !== snapshot.baselineHash) {
    throw new Error('Proposal baseline does not match the analyzed Skill snapshot.')
  }
  await assertCurrentHash(snapshot.path, proposal.beforeHash, 'apply the proposal')
  await writeFile(snapshot.path, proposal.revisedContent, 'utf8')
}

export async function revertSkillProposal(
  snapshot: SkillSourceSnapshot,
  proposal: SkillProposal,
): Promise<void> {
  await assertCurrentHash(snapshot.path, proposal.afterHash, 'revert the proposal')
  await writeFile(snapshot.path, snapshot.rawContent, 'utf8')
}
