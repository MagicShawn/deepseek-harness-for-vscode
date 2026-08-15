import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  applySkillProposal,
  createSkillProposal,
  readSkillSnapshot,
  revertSkillProposal,
} from '../../src/skill/file.js'

describe('Skill file safety', () => {
  test('preserves frontmatter and newline style while generating a proposal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-'))
    const path = join(directory, 'SKILL.md')
    await writeFile(path, '---\r\nname: demo-skill\r\ndescription: Demo\r\n---\r\n# Old\r\n', 'utf8')
    const snapshot = await readSkillSnapshot({ name: 'demo-skill', path, provider: 'filesystem' })

    const proposal = createSkillProposal(snapshot, '# New\n\nDo the safer thing.\n')

    expect(proposal.revisedContent).toBe(
      '---\r\nname: demo-skill\r\ndescription: Demo\r\n---\r\n# New\r\n\r\nDo the safer thing.\r\n',
    )
    expect(proposal.unifiedDiff).toContain('-# Old')
    expect(proposal.unifiedDiff).toContain('+# New')
  })

  test('applies and reverts only when the current hash matches', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-'))
    const path = join(directory, 'SKILL.md')
    await writeFile(path, '# Old\n', 'utf8')
    const snapshot = await readSkillSnapshot({ name: 'demo-skill', path, provider: 'filesystem' })
    const proposal = createSkillProposal(snapshot, '# New\n')

    await applySkillProposal(snapshot, proposal)
    expect(await readFile(path, 'utf8')).toBe('# New\n')
    await revertSkillProposal(snapshot, proposal)
    expect(await readFile(path, 'utf8')).toBe('# Old\n')

    await writeFile(path, '# Edited elsewhere\n', 'utf8')
    await expect(applySkillProposal(snapshot, proposal)).rejects.toThrow(/changed/i)
  })

  test('refuses non-SKILL.md paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-insight-'))
    const path = join(directory, 'notes.md')
    await writeFile(path, '# Notes\n', 'utf8')

    await expect(
      readSkillSnapshot({ name: 'demo-skill', path, provider: 'filesystem' }),
    ).rejects.toThrow(/SKILL\.md/)
  })
})
