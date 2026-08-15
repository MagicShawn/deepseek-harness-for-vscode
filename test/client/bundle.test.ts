// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { describe, expect, test } from 'vitest'

interface Handoff {
  id: string
  factory: (require: (id: string) => unknown) => Record<string, unknown>
}

function builtBundle(): string | undefined {
  try {
    return readFileSync(resolve('lib/client.js'), 'utf8')
  } catch {
    return undefined
  }
}

describe('browser bundle handoff', () => {
  const code = builtBundle()

  test.skipIf(code === undefined)('registers a Harness client plugin with the module loader', () => {
    let handoff: Handoff | undefined
    const target = window as unknown as { __ModuleLoader__: { load(value: Handoff): void } }
    target.__ModuleLoader__ = { load: value => { handoff = value } }
    // Deliberately execute the built browser artifact in its target global scope.
    new Function(code!)()
    expect(handoff?.id).toBe('deepseek-harness-skill-insight')
    const modules = new Map<string, unknown>([
      ['react', React],
      ['react/jsx-runtime', ReactJsxRuntime],
    ])
    const plugin = handoff!.factory((id) => {
      if (!modules.has(id)) throw new Error(`Unexpected client external: ${id}`)
      return modules.get(id)
    })
    expect(plugin.inject).toEqual(['slots', 'conversationEvents', 'conversationViews', 'sessions'])
    expect(plugin.apply).toBeTypeOf('function')
  })
})
