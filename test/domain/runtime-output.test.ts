import { describe, expect, it } from 'vitest'
import { parseHarnessUrl, redactRuntimeLog } from '../../src/domain/runtimeOutput.js'

describe('parseHarnessUrl', () => {
  it.each([
    ['dsh web: http://127.0.0.1:3080', 'http://127.0.0.1:3080/'],
    ['DeepSeek Harness ready at http://localhost:4312/', 'http://localhost:4312/'],
    ['  Local:   http://127.0.0.1:5173/dashboard  ', 'http://127.0.0.1:5173/dashboard'],
  ])('recognizes loopback Web UI output %s', (line, expected) => {
    expect(parseHarnessUrl(line)).toBe(expected)
  })

  it('does not accept a remote or credential-bearing URL from process output', () => {
    expect(parseHarnessUrl('ready at http://192.168.1.10:3080')).toBeUndefined()
    expect(parseHarnessUrl('ready at http://user:secret@127.0.0.1:3080')).toBeUndefined()
  })
})

describe('redactRuntimeLog', () => {
  it('removes authorization, cookie, API key, URL credential, and query values', () => {
    const line = 'Authorization: Bearer secret; Cookie=session-secret; api_key=sk-secret http://user:pass@127.0.0.1:3080/?token=url-secret'
    const redacted = redactRuntimeLog(line)
    expect(redacted).not.toMatch(/secret|user:pass/u)
    expect(redacted).toContain('[REDACTED]')
  })
})
