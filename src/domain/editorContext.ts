import path from 'node:path'

export interface EditorContextInput {
  absolutePath: string
  workspacePath?: string
  languageId: string
  text: string
  startLine: number
  endLine: number
  selected: boolean
}

function displayPath(input: EditorContextInput): string {
  if (input.workspacePath !== undefined) {
    const relative = path.relative(input.workspacePath, input.absolutePath)
    if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.replaceAll('\\', '/')
    }
  }
  return input.absolutePath.replaceAll('\\', '/')
}

function fenceFor(text: string): string {
  const lengths = [...text.matchAll(/`+/gu)].map(match => match[0].length)
  return '`'.repeat(Math.max(3, ...lengths.map(length => length + 1)))
}

function languageFence(languageId: string): string {
  return languageId === 'plaintext' ? 'text' : languageId
}

export function formatEditorContext(input: EditorContextInput): string {
  const file = displayPath(input)
  const location = input.selected
    ? `来自 \`${file}:${input.startLine}${input.endLine === input.startLine ? '' : `-${input.endLine}`}\` 的选区：`
    : `文件 \`${file}\`：`
  const fence = fenceFor(input.text)
  return `${location}\n\n${fence}${languageFence(input.languageId)}\n${input.text}\n${fence}`
}
