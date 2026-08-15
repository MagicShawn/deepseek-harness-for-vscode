import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface Manifest {
  name?: string
  displayName?: string
  version?: string
  publisher?: string
  icon?: string
  pricing?: string
  repository?: { type?: string; url?: string }
  homepage?: string
  bugs?: { url?: string }
  galleryBanner?: { color?: string; theme?: string }
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
  it('declares the public Marketplace identity and support metadata', async () => {
    const value = await manifest()
    expect(value).toMatchObject({
      name: 'deepseek-harness-ui',
      displayName: 'DeepSeek Harness UI (Unofficial)',
      version: '0.1.1',
      publisher: 'magicshawn',
      icon: 'media/icon.png',
      pricing: 'Free',
      repository: {
        type: 'git',
        url: 'https://github.com/MagicShawn/deepseek-harness-for-vscode.git',
      },
      homepage: 'https://github.com/MagicShawn/deepseek-harness-for-vscode#readme',
      bugs: {
        url: 'https://github.com/MagicShawn/deepseek-harness-for-vscode/issues',
      },
      galleryBanner: {
        color: '#111827',
        theme: 'dark',
      },
    })
  })

  it('ships valid Marketplace media and references the interface demo', async () => {
    await access(path.resolve('media/demo-overview.png'))
    const icon = await readFile(path.resolve('media/icon.png'))
    expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(icon.readUInt32BE(16)).toBe(128)
    expect(icon.readUInt32BE(20)).toBe(128)

    const imageUrl = 'https://raw.githubusercontent.com/MagicShawn/deepseek-harness-for-vscode/main/media/demo-overview.png'
    await expect(readFile(path.resolve('README.md'), 'utf8')).resolves.toContain(imageUrl)
    await expect(readFile(path.resolve('README.zh-CN.md'), 'utf8')).resolves.toContain(imageUrl)
  })

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
