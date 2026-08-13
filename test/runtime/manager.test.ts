import { describe, expect, it, vi } from 'vitest'
import type { LaunchConfig } from '../../src/domain/launch.js'
import {
  HarnessRuntimeManager,
  type ProcessCallbacks,
  type ProcessHandle,
  type RuntimeDependencies,
} from '../../src/runtime/manager.js'

class FakeProcess implements ProcessHandle {
  readonly pid = 7
  killed = false

  constructor(private readonly callbacks: ProcessCallbacks) {}

  stdout(line: string): void {
    this.callbacks.stdout(line)
  }

  stderr(line: string): void {
    this.callbacks.stderr(line)
  }

  error(message: string): void {
    this.callbacks.error(new Error(message))
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.callbacks.exit(code, signal)
  }

  async kill(): Promise<void> {
    this.killed = true
  }
}

function config(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  return { mode: 'managed', externalUrl: '', port: 0, ...overrides }
}

function setup(overrides: Partial<RuntimeDependencies> = {}): {
  manager: HarnessRuntimeManager
  processes: FakeProcess[]
  logs: string[]
  probe: ReturnType<typeof vi.fn>
} {
  const processes: FakeProcess[] = []
  const logs: string[] = []
  const probe = vi.fn(async () => true)
  const dependencies: RuntimeDependencies = {
    config: config(),
    cwd: 'D:\\workspace',
    platform: 'win32',
    dshCommand: undefined,
    startupTimeoutMs: 100,
    probe,
    spawn: (_command, _args, _options, callbacks) => {
      const process = new FakeProcess(callbacks)
      processes.push(process)
      return process
    },
    log: line => logs.push(line),
    ...overrides,
  }
  return { manager: new HarnessRuntimeManager(dependencies), processes, logs, probe }
}

describe('HarnessRuntimeManager', () => {
  it('connects to a healthy external instance without spawning or owning it', async () => {
    const spawn = vi.fn()
    const fixture = setup({
      config: config({ mode: 'external', externalUrl: 'http://127.0.0.1:3080' }),
      probe: async () => true,
      spawn,
    })

    await expect(fixture.manager.start()).resolves.toEqual({
      url: 'http://127.0.0.1:3080/',
      managed: false,
    })
    expect(fixture.manager.status).toEqual({
      state: 'ready',
      url: 'http://127.0.0.1:3080/',
      managed: false,
    })
    expect(spawn).not.toHaveBeenCalled()
    await fixture.manager.stop()
    expect(fixture.manager.status).toEqual({ state: 'stopped' })
  })

  it('surfaces an actionable error when an external instance is unreachable', async () => {
    const fixture = setup({
      config: config({ mode: 'external', externalUrl: 'http://127.0.0.1:3999' }),
      probe: async () => false,
    })

    await expect(fixture.manager.start()).rejects.toThrow('unreachable')
    expect(fixture.manager.status).toMatchObject({ state: 'error' })
  })

  it('redacts external URL query values from status diagnostics', async () => {
    const fixture = setup({
      config: config({ mode: 'external', externalUrl: 'http://127.0.0.1:3999/?token=secret-value' }),
      probe: async () => false,
    })

    await expect(fixture.manager.start()).rejects.not.toThrow('secret-value')
    expect(fixture.manager.status).toMatchObject({ state: 'error' })
    if (fixture.manager.status.state === 'error') expect(fixture.manager.status.message).not.toContain('secret-value')
  })

  it('cancels an in-flight external health probe without later changing to error', async () => {
    let aborted = false
    const fixture = setup({
      config: config({ mode: 'external', externalUrl: 'http://127.0.0.1:3999' }),
      probe: async (_url, signal) => await new Promise<boolean>(resolve => {
        signal.addEventListener('abort', () => { aborted = true; resolve(false) }, { once: true })
        setTimeout(() => resolve(false), 50)
      }),
    })
    const started = fixture.manager.start()
    await fixture.manager.stop()

    await expect(started).rejects.toThrow('stopped')
    expect(aborted).toBe(true)
    expect(fixture.manager.status).toEqual({ state: 'stopped' })
  })

  it('becomes ready only after discovering and probing the managed Web URL', async () => {
    const fixture = setup()
    const started = fixture.manager.start()

    expect(fixture.manager.status).toEqual({ state: 'starting' })
    fixture.processes[0]?.stdout('booting plugins')
    fixture.processes[0]?.stdout('dsh web: http://127.0.0.1:43125')

    await expect(started).resolves.toEqual({ url: 'http://127.0.0.1:43125/', managed: true })
    expect(fixture.probe).toHaveBeenCalledWith('http://127.0.0.1:43125/', expect.any(AbortSignal))
    expect(fixture.logs).toContain('[Harness] booting plugins')
  })

  it('deduplicates concurrent start calls into one managed process', async () => {
    const fixture = setup()
    const first = fixture.manager.start()
    const second = fixture.manager.start()

    expect(fixture.processes).toHaveLength(1)
    fixture.processes[0]?.stdout('dsh web: http://localhost:3099')
    await expect(Promise.all([first, second])).resolves.toEqual([
      { url: 'http://localhost:3099/', managed: true },
      { url: 'http://localhost:3099/', managed: true },
    ])
  })

  it('moves a ready runtime to error when its process exits unexpectedly', async () => {
    const fixture = setup()
    const started = fixture.manager.start()
    fixture.processes[0]?.stdout('dsh web: http://127.0.0.1:3080')
    await started

    fixture.processes[0]?.exit(17)
    expect(fixture.manager.status).toMatchObject({
      state: 'error',
      message: expect.stringContaining('17'),
    })
  })

  it('kills the owned process before a restart and creates exactly one replacement', async () => {
    const fixture = setup()
    const firstStart = fixture.manager.start()
    fixture.processes[0]?.stdout('dsh web: http://127.0.0.1:3080')
    await firstStart

    const restarted = fixture.manager.restart()
    await vi.waitFor(() => expect(fixture.processes).toHaveLength(2))
    expect(fixture.processes[0]?.killed).toBe(true)
    fixture.processes[1]?.stdout('dsh web: http://127.0.0.1:3081')
    await expect(restarted).resolves.toEqual({ url: 'http://127.0.0.1:3081/', managed: true })
  })

  it('ignores a late exit from the stopped process after its replacement is ready', async () => {
    const fixture = setup()
    const firstStart = fixture.manager.start()
    fixture.processes[0]?.stdout('dsh web: http://127.0.0.1:3080')
    await firstStart

    const restarted = fixture.manager.restart()
    await vi.waitFor(() => expect(fixture.processes).toHaveLength(2))
    fixture.processes[1]?.stdout('dsh web: http://127.0.0.1:3081')
    await restarted
    fixture.processes[0]?.exit(null, 'SIGTERM')

    expect(fixture.manager.status).toEqual({
      state: 'ready',
      url: 'http://127.0.0.1:3081/',
      managed: true,
    })
  })

  it('times out and cleans up a process that never announces a URL', async () => {
    const fixture = setup({ startupTimeoutMs: 10 })

    await expect(fixture.manager.start()).rejects.toThrow('timed out')
    expect(fixture.processes[0]?.killed).toBe(true)
    expect(fixture.manager.status).toMatchObject({ state: 'error' })
  })

  it('cancels a pending startup immediately when stopped without later changing to error', async () => {
    const fixture = setup({ startupTimeoutMs: 10_000 })
    const started = fixture.manager.start()
    await fixture.manager.stop()

    await expect(started).rejects.toThrow('stopped')
    expect(fixture.processes[0]?.killed).toBe(true)
    expect(fixture.manager.status).toEqual({ state: 'stopped' })
  })

  it('fails immediately with the spawn diagnostic when a custom command does not exist', async () => {
    const fixture = setup({ startupTimeoutMs: 10_000 })
    const started = fixture.manager.start()
    fixture.processes[0]?.error('spawn missing-dsh ENOENT')

    await expect(started).rejects.toThrow('ENOENT')
    expect(fixture.manager.status).toMatchObject({ state: 'error', message: expect.stringContaining('ENOENT') })
  })
})
