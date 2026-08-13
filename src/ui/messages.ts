export const SHELL_COMMANDS = [
  'start',
  'stop',
  'restart',
  'refresh',
  'openBrowser',
  'showLogs',
  'openSettings',
  'newSession',
] as const

export type ShellCommand = typeof SHELL_COMMANDS[number]

export type ShellMessage =
  | { type: 'ready' }
  | { type: 'command'; command: ShellCommand }
  | { type: 'openFile'; value: string }
  | { type: 'contextResult'; ok: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseShellMessage(value: unknown): ShellMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined
  switch (value.type) {
    case 'ready':
      return { type: 'ready' }
    case 'command':
      if (typeof value.command !== 'string' || !SHELL_COMMANDS.includes(value.command as ShellCommand)) return undefined
      return { type: 'command', command: value.command as ShellCommand }
    case 'openFile':
      if (typeof value.value !== 'string' || value.value.length === 0 || value.value.length > 16_384) return undefined
      return { type: 'openFile', value: value.value }
    case 'contextResult':
      if (typeof value.ok !== 'boolean') return undefined
      return { type: 'contextResult', ok: value.ok }
    default:
      return undefined
  }
}
