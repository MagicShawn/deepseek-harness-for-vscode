import { describe, expect, it } from 'vitest'
import { parseShellMessage } from '../../src/ui/messages.js'

describe('parseShellMessage', () => {
  it.each([
    [{ type: 'ready' }, { type: 'ready' }],
    [{ type: 'command', command: 'restart' }, { type: 'command', command: 'restart' }],
    [{ type: 'openFile', value: 'src/app.ts:4' }, { type: 'openFile', value: 'src/app.ts:4' }],
    [{ type: 'contextResult', ok: false }, { type: 'contextResult', ok: false }],
  ])('accepts a supported message %j', (input, expected) => {
    expect(parseShellMessage(input)).toEqual(expected)
  })

  it.each([
    null,
    { type: 'command', command: 'workbench.action.openSettings' },
    { type: 'openFile', value: 7 },
    { type: '__proto__', command: 'restart' },
  ])('rejects an untrusted message %j', input => {
    expect(parseShellMessage(input)).toBeUndefined()
  })
})
