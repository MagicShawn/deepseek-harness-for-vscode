import { describe, expect, it } from 'vitest'
import { createEditorContext, type TextDocumentLike, type TextEditorLike } from '../../src/ide/context.js'

function document(text: string): TextDocumentLike {
  const lines = text.split('\n')
  return {
    fileName: 'D:\\repo\\src\\app.ts',
    languageId: 'typescript',
    isUntitled: false,
    uriPath: 'file:///D:/repo/src/app.ts',
    getText: range => {
      if (range === undefined) return text
      if (range.start.line === range.end.line) return lines[range.start.line]?.slice(range.start.character, range.end.character) ?? ''
      return [
        lines[range.start.line]?.slice(range.start.character) ?? '',
        ...lines.slice(range.start.line + 1, range.end.line),
        lines[range.end.line]?.slice(0, range.end.character) ?? '',
      ].join('\n')
    },
  }
}

describe('createEditorContext', () => {
  it('uses only the selected text and converts zero-based editor lines to one-based context lines', () => {
    const editor: TextEditorLike = {
      document: document('zero\nconst answer = 42\nend'),
      selection: {
        isEmpty: false,
        start: { line: 1, character: 6 },
        end: { line: 1, character: 12 },
      },
    }
    expect(createEditorContext(editor, 'D:\\repo')).toMatchObject({
      text: 'answer',
      startLine: 2,
      endLine: 2,
      selected: true,
      workspacePath: 'D:\\repo',
    })
  })

  it('uses the whole document when there is no selection', () => {
    const doc = document('one\ntwo')
    const editor: TextEditorLike = {
      document: doc,
      selection: {
        isEmpty: true,
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    }
    expect(createEditorContext(editor, undefined)).toEqual({
      absolutePath: doc.fileName,
      languageId: 'typescript',
      text: 'one\ntwo',
      startLine: 1,
      endLine: 2,
      selected: false,
    })
  })
})
