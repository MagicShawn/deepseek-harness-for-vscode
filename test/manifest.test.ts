import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface Manifest {
  activationEvents?: string[]
  contributes?: {
    commands?: Array<{ command: string; title: string; icon?: string }>
    configuration?: { properties?: Record<string, unknown> }
    viewsContainers?: { activitybar?: Array<{ id: string; icon: string }> }
    views?: Record<string, Array<{ id: string; type?: string }>>
    menus?: Record<string, Array<{ command: string }>>
  }
}

async function manifest(): Promise<Manifest> {
  return JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as Manifest
}

describe('extension manifest', () => {
  it('declares startup and both visual activation surfaces', async () => {
    const value = await manifest()
    expect(value.activationEvents).toEqual(expect.arrayContaining([
      'onStartupFinished',
      'onView:deepseekHarness.sidebar',
      'onWebviewPanel:deepseekHarness.panel',
    ]))
    expect(value.contributes?.viewsContainers?.activitybar).toContainEqual({
      id: 'deepseekHarness',
      title: 'DeepSeek Harness',
      icon: 'media/activity.svg',
    })
    expect(value.contributes?.views?.deepseekHarness).toContainEqual(expect.objectContaining({
      id: 'deepseekHarness.sidebar',
      type: 'webview',
    }))
  })

  it('declares every command implemented by the extension controller', async () => {
    const value = await manifest()
    const commands = new Set(value.contributes?.commands?.map(item => item.command))
    expect(commands).toEqual(new Set([
      'deepseekHarness.focus',
      'deepseekHarness.openPanel',
      'deepseekHarness.newSession',
      'deepseekHarness.sendSelection',
      'deepseekHarness.sendFile',
      'deepseekHarness.compareFiles',
      'deepseekHarness.start',
      'deepseekHarness.stop',
      'deepseekHarness.restart',
      'deepseekHarness.refresh',
      'deepseekHarness.openBrowser',
      'deepseekHarness.showLogs',
      'deepseekHarness.openSettings',
    ]))
  })

  it('contributes guarded editor context actions and all runtime settings', async () => {
    const value = await manifest()
    expect(value.contributes?.menus?.['editor/context']?.map(item => item.command)).toEqual([
      'deepseekHarness.sendSelection',
      'deepseekHarness.sendFile',
    ])
    expect(Object.keys(value.contributes?.configuration?.properties ?? {})).toEqual([
      'deepseekHarness.connectionMode',
      'deepseekHarness.externalUrl',
      'deepseekHarness.command',
      'deepseekHarness.port',
      'deepseekHarness.startupTimeout',
      'deepseekHarness.openOnStartup',
    ])
  })
})
