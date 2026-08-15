import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveExistingFileLocation } from '../../src/ide/navigation.js'

describe('resolveExistingFileLocation', () => {
  it('resolves a workspace-relative file and converts one-based locations to zero-based positions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dsh-vscode-nav-'))
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src', 'app.ts'), 'one\ntwo\nthree\n')

    await expect(resolveExistingFileLocation('src/app.ts:2:3', [root])).resolves.toEqual({
      absolutePath: path.join(root, 'src', 'app.ts'),
      line: 1,
      column: 2,
    })
  })

  it('refuses relative traversal even when the escaped file exists', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'dsh-vscode-nav-parent-'))
    const root = path.join(parent, 'workspace')
    await mkdir(root)
    await writeFile(path.join(parent, 'secret.txt'), 'secret')

    await expect(resolveExistingFileLocation('../secret.txt', [root])).resolves.toBeUndefined()
  })

  it('refuses a relative path that escapes through a workspace junction or symlink', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'dsh-vscode-nav-link-'))
    const root = path.join(parent, 'workspace')
    const outside = path.join(parent, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(path.join(outside, 'secret.txt'), 'secret')
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')

    await expect(resolveExistingFileLocation('escape/secret.txt', [root])).resolves.toBeUndefined()
  })

  it('accepts an explicit absolute file but refuses missing files and directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dsh-vscode-nav-'))
    const file = path.join(root, 'note.txt')
    await writeFile(file, 'note')
    await expect(resolveExistingFileLocation(`${file}:1`, [])).resolves.toEqual({
      absolutePath: file,
      line: 0,
      column: 0,
    })
    await expect(resolveExistingFileLocation(path.join(root, 'missing.txt'), [])).resolves.toBeUndefined()
    await expect(resolveExistingFileLocation(root, [])).resolves.toBeUndefined()
  })
})
