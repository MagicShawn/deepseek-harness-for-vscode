import { describe, expect, it } from 'vitest'
import { formatEditorContext } from '../../src/domain/editorContext.js'

describe('formatEditorContext', () => {
  it('formats a selection with a workspace-relative path and one-based line range', () => {
    expect(formatEditorContext({
      absolutePath: 'D:\\work\\demo\\src\\main.ts',
      workspacePath: 'D:\\work\\demo',
      languageId: 'typescript',
      text: 'const answer = 42\nconsole.log(answer)',
      startLine: 3,
      endLine: 4,
      selected: true,
    })).toBe('来自 `src/main.ts:3-4` 的选区：\n\n```typescript\nconst answer = 42\nconsole.log(answer)\n```')
  })

  it('formats an unselected whole file without an artificial line suffix', () => {
    expect(formatEditorContext({
      absolutePath: '/workspace/readme',
      workspacePath: '/workspace',
      languageId: 'plaintext',
      text: 'hello',
      startLine: 1,
      endLine: 1,
      selected: false,
    })).toBe('文件 `readme`：\n\n```text\nhello\n```')
  })

  it('escapes a code fence that already occurs in the source', () => {
    expect(formatEditorContext({
      absolutePath: '/workspace/example.md',
      workspacePath: '/workspace',
      languageId: 'markdown',
      text: '```js\nalert(1)\n```',
      startLine: 1,
      endLine: 3,
      selected: true,
    })).toContain('````markdown\n```js\nalert(1)\n```\n````')
  })
})
