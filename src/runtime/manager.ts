import { resolveLaunchPlan, type LaunchConfig, type RuntimePlatform } from '../domain/launch.js'
import { parseHarnessUrl } from '../domain/runtimeOutput.js'

export type RuntimeStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'ready'; url: string; managed: boolean }
  | { state: 'error'; message: string }

export interface RuntimeReady {
  url: string
  managed: boolean
}

export interface ProcessCallbacks {
  stdout(line: string): void
  stderr(line: string): void
  exit(code: number | null, signal: NodeJS.Signals | null): void
}

export interface ProcessHandle {
  readonly pid: number | undefined
  kill(): Promise<void>
}

export interface SpawnOptions {
  cwd: string
  env: NodeJS.ProcessEnv
}

export type ProcessSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
  callbacks: ProcessCallbacks,
) => ProcessHandle

export type HealthProbe = (url: string, signal: AbortSignal) => Promise<boolean>

export interface RuntimeDependencies {
  config: LaunchConfig
  cwd: string
  platform: RuntimePlatform
  dshOnPath: boolean
  startupTimeoutMs: number
  spawn: ProcessSpawner
  probe: HealthProbe
  log(line: string): void
  env?: NodeJS.ProcessEnv
}

export class HarnessRuntimeManager {
  private currentStatus: RuntimeStatus = { state: 'stopped' }
  private process: ProcessHandle | undefined
  private startPromise: Promise<RuntimeReady> | undefined
  private stopping = false
  private readonly listeners = new Set<(status: RuntimeStatus) => void>()

  constructor(private readonly dependencies: RuntimeDependencies) {}

  get status(): RuntimeStatus {
    return this.currentStatus
  }

  onDidChangeStatus(listener: (status: RuntimeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): Promise<RuntimeReady> {
    if (this.currentStatus.state === 'ready') {
      return Promise.resolve({ url: this.currentStatus.url, managed: this.currentStatus.managed })
    }
    if (this.startPromise !== undefined) return this.startPromise

    this.setStatus({ state: 'starting' })
    const operation = this.startInternal()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.setStatus({ state: 'error', message })
        throw error
      })
      .finally(() => {
        if (this.startPromise === operation) this.startPromise = undefined
      })
    this.startPromise = operation
    return operation
  }

  async stop(): Promise<void> {
    this.stopping = true
    const owned = this.process
    this.process = undefined
    if (owned !== undefined) await owned.kill()
    this.startPromise = undefined
    this.setStatus({ state: 'stopped' })
    this.stopping = false
  }

  async restart(): Promise<RuntimeReady> {
    await this.stop()
    return this.start()
  }

  private async startInternal(): Promise<RuntimeReady> {
    const plan = resolveLaunchPlan(
      this.dependencies.config,
      this.dependencies.dshOnPath,
      this.dependencies.platform,
    )
    if (plan.kind === 'external') {
      const controller = new AbortController()
      const healthy = await this.dependencies.probe(plan.url, controller.signal)
      if (!healthy) throw new Error(`DeepSeek Harness external URL is unreachable: ${plan.url}`)
      const ready = { url: plan.url, managed: false }
      this.setStatus({ state: 'ready', ...ready })
      return ready
    }

    const ready = await this.startManaged(plan.command, plan.args)
    this.setStatus({ state: 'ready', ...ready })
    return ready
  }

  private startManaged(command: string, args: string[]): Promise<RuntimeReady> {
    return new Promise<RuntimeReady>((resolve, reject) => {
      let settled = false
      let probing = false
      const controller = new AbortController()

      const rejectOnce = async (error: Error, kill: boolean): Promise<void> => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        controller.abort()
        const owned = this.process
        this.process = undefined
        if (kill && owned !== undefined) await owned.kill()
        reject(error)
      }

      const acceptUrl = (line: string): void => {
        const url = parseHarnessUrl(line)
        if (url === undefined || probing || settled) return
        probing = true
        void this.dependencies.probe(url, controller.signal).then(healthy => {
          if (settled) return
          probing = false
          if (!healthy) return
          settled = true
          clearTimeout(timer)
          resolve({ url, managed: true })
        }).catch(error => {
          probing = false
          if (!settled) void rejectOnce(error instanceof Error ? error : new Error(String(error)), true)
        })
      }

      const timer = setTimeout(() => {
        void rejectOnce(
          new Error(`DeepSeek Harness startup timed out after ${this.dependencies.startupTimeoutMs} ms`),
          true,
        )
      }, this.dependencies.startupTimeoutMs)

      try {
        this.stopping = false
        this.process = this.dependencies.spawn(command, args, {
          cwd: this.dependencies.cwd,
          env: { ...process.env, ...this.dependencies.env },
        }, {
          stdout: line => {
            this.dependencies.log(`[Harness] ${line}`)
            acceptUrl(line)
          },
          stderr: line => {
            this.dependencies.log(`[Harness:stderr] ${line}`)
            acceptUrl(line)
          },
          exit: (code, signal) => {
            this.process = undefined
            if (this.stopping) return
            const detail = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
            const error = new Error(`DeepSeek Harness process stopped unexpectedly (${detail})`)
            if (!settled) void rejectOnce(error, false)
            else this.setStatus({ state: 'error', message: error.message })
          },
        })
      } catch (error) {
        void rejectOnce(error instanceof Error ? error : new Error(String(error)), false)
      }
    })
  }

  private setStatus(status: RuntimeStatus): void {
    this.currentStatus = status
    for (const listener of this.listeners) listener(status)
  }
}
