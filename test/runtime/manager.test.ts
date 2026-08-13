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
    dshOnPath: false,
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

  it('times out and cleans up a process that never announces a URL', async () => {
    const fixture = setup({ startupTimeoutMs: 10 })

    await expect(fixture.manager.start()).rejects.toThrow('timed out')
    expect(fixture.processes[0]?.killed).toBe(true)
    expect(fixture.manager.status).toMatchObject({ state: 'error' })
  })
})
