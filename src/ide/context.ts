import type { EditorContextInput } from '../domain/editorContext.js'

export interface PositionLike {
  line: number
  character: number
}

export interface RangeLike {
  start: PositionLike
  end: PositionLike
}

export interface SelectionLike extends RangeLike {
  isEmpty: boolean
}

export interface TextDocumentLike {
  fileName: string
  languageId: string
  isUntitled: boolean
  uriPath: string
  getText(range?: RangeLike): string
}

export interface TextEditorLike {
  document: TextDocumentLike
  selection: SelectionLike
}

function lineCount(text: string): number {
  return text === '' ? 1 : text.split(/\r?\n/u).length
}

export function createEditorContext(editor: TextEditorLike, workspacePath: string | undefined): EditorContextInput {
  const selected = !editor.selection.isEmpty
  const text = selected ? editor.document.getText(editor.selection) : editor.document.getText()
  const startLine = selected ? editor.selection.start.line + 1 : 1
  const endLine = selected ? editor.selection.end.line + 1 : lineCount(text)
  return {
    absolutePath: editor.document.isUntitled ? editor.document.uriPath : editor.document.fileName,
    ...(workspacePath !== undefined && { workspacePath }),
    languageId: editor.document.languageId,
    text,
    startLine,
    endLine,
    selected,
  }
}
