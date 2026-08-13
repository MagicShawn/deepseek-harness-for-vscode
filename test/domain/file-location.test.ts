import { describe, expect, it } from 'vitest'
import { parseFileLocation } from '../../src/domain/fileLocation.js'

describe('parseFileLocation', () => {
  it.each([
    ['D:\\repo\\src\\app.ts:12:7', { path: 'D:\\repo\\src\\app.ts', line: 12, column: 7 }],
    ['/repo/src/app.ts:9', { path: '/repo/src/app.ts', line: 9 }],
    ['src/app.ts#L4', { path: 'src/app.ts', line: 4 }],
    ['file:///D:/repo/src/app.ts#L2:5', { path: 'D:/repo/src/app.ts', line: 2, column: 5 }],
  ])('parses %s', (value, expected) => {
    expect(parseFileLocation(value)).toEqual(expected)
  })

  it.each(['https://example.com/app.ts:2', 'javascript:alert(1)', '', 'src/app.ts:0'])(
    'refuses unsafe or invalid location %s',
    (value) => {
      expect(parseFileLocation(value)).toBeUndefined()
    },
  )
})
