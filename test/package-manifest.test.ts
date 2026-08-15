import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

interface PackageManifest {
  name?: string
  main?: string
  exports?: Record<string, { default?: string }>
  dsh?: {
    bundle?: { patch?: string }
    client?: { platform?: string; inject?: string[] }
  }
}

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as PackageManifest

describe('Harness plugin package manifest', () => {
  test('declares an installable Harness bundle and browser client', () => {
    expect(pkg.name).toBe('deepseek-harness-skill-insight')
    expect(pkg.main).toBe('./lib/index.js')
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(pkg.dsh?.client?.platform).toBe('web')
    expect(pkg.exports?.['./client']?.default).toBe('./lib/client.js')
  })

  test('orders the browser plugin after the runtime and conversation UI', () => {
    expect(pkg.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-conversation',
    ])
  })
})
