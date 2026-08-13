import path from 'node:path'
import * as vscode from 'vscode'
import { formatEditorContext } from './domain/editorContext.js'
import type { ConnectionMode } from './domain/launch.js'
import { createEditorContext } from './ide/context.js'
import { resolveExistingFileLocation } from './ide/navigation.js'
import { createIdeBridgeScript } from './proxy/ideBridge.js'
import { HarnessProxy } from './proxy/server.js'
import { findCommand } from './runtime/discovery.js'
import { probeHarness } from './runtime/health.js'
import { HarnessRuntimeManager } from './runtime/manager.js'
import { spawnHarnessProcess } from './runtime/process.js'
import { HarnessUiController, statusLabel, type UiControllerActions } from './ui/controller.js'
import { createHarnessPanel, HarnessPanelSerializer, HarnessSidebarProvider } from './ui/provider.js'

let activeController: HarnessUiController | undefined

function configuration(): {
  mode: ConnectionMode
  externalUrl: string
  command: string
  port: number
  timeoutMs: number
  openOnStartup: boolean
} {
  const config = vscode.workspace.getConfiguration('deepseekHarness')
  return {
    mode: config.get<ConnectionMode>('connectionMode', 'auto'),
    externalUrl: config.get<string>('externalUrl', ''),
    command: config.get<string>('command', ''),
    port: config.get<number>('port', 0),
    timeoutMs: config.get<number>('startupTimeout', 60) * 1000,
    openOnStartup: config.get<boolean>('openOnStartup', false),
  }
}

function workspaceRoots(): string[] {
  return vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? []
}

async function openFileLocation(value: string): Promise<void> {
  const resolved = await resolveExistingFileLocation(value, workspaceRoots())
  if (resolved === undefined) {
    await vscode.window.showWarningMessage(`无法打开文件：${value}`)
    return
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(resolved.absolutePath))
  const editor = await vscode.window.showTextDocument(document, { preview: true })
  const position = new vscode.Position(resolved.line, resolved.column)
  editor.selection = new vscode.Selection(position, position)
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

async function compareFiles(): Promise<void> {
  const first = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: '选择比较基准文件' })
  if (first?.[0] === undefined) return
  const second = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: '选择比较目标文件' })
  if (second?.[0] === undefined) return
  await vscode.commands.executeCommand('vscode.diff', first[0], second[0], `${path.basename(first[0].fsPath)} ↔ ${path.basename(second[0].fsPath)}`)
}

async function sendEditorContext(controller: HarnessUiController, forceWholeFile: boolean): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (editor === undefined) {
    await vscode.window.showInformationMessage('请先打开一个文件。')
    return
  }
  const workspace = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath
  const selection = forceWholeFile
    ? new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))
    : editor.selection
  const context = createEditorContext({
    document: {
      fileName: editor.document.fileName,
      languageId: editor.document.languageId,
      isUntitled: editor.document.isUntitled,
      uriPath: editor.document.uri.toString(),
      getText: range => range === undefined
        ? editor.document.getText()
        : editor.document.getText(new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)),
    },
    selection: forceWholeFile ? {
      isEmpty: true,
      start: selection.start,
      end: selection.end,
    } : editor.selection,
  }, workspace)
  const text = formatEditorContext(context)
  await vscode.env.clipboard.writeText(text)
  await vscode.commands.executeCommand('workbench.view.extension.deepseekHarness')
  await controller.ensureStarted()
  const delivered = await controller.sendContext(text)
  if (!delivered) {
    await vscode.window.showInformationMessage('上下文已复制到剪贴板；打开 Harness 后可直接粘贴。')
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = configuration()
  const output = vscode.window.createOutputChannel('DeepSeek Harness')
  output.appendLine('[Extension] Activating DeepSeek Harness UI')
  const workspace = vscode.workspace.workspaceFolders?.[0]
  if (workspace === undefined) await vscode.workspace.fs.createDirectory(context.globalStorageUri)
  const cwd = workspace?.uri.fsPath ?? context.globalStorageUri.fsPath
  const dshCommand = await findCommand('dsh')
  output.appendLine(`[Runtime] dsh on PATH: ${dshCommand !== undefined ? 'yes' : 'no; npx fallback enabled'}`)

  const runtime = new HarnessRuntimeManager({
    config: {
      mode: settings.mode,
      externalUrl: settings.externalUrl,
      ...(settings.command.trim() !== '' && { command: settings.command }),
      port: settings.port,
    },
    cwd,
    platform: process.platform,
    dshCommand,
    startupTimeoutMs: settings.timeoutMs,
    spawn: spawnHarnessProcess,
    probe: probeHarness,
    log: line => output.appendLine(line),
  })

  const controllerRef: { current: HarnessUiController | undefined } = { current: undefined }
  const actions: UiControllerActions = {
    openBrowser: async () => {
      const url = controllerRef.current?.upstreamUrl
      if (url === undefined) await vscode.window.showInformationMessage('DeepSeek Harness 尚未就绪。')
      else await vscode.env.openExternal(vscode.Uri.parse(url))
    },
    showLogs: () => output.show(true),
    openSettings: async () => { await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.deepseek-harness-ui') },
    openFile: openFileLocation,
    newSession: async () => { controllerRef.current?.newSession() },
    notifyContextFallback: async () => { await vscode.window.showInformationMessage('页面输入框不可用；上下文已保留在剪贴板。') },
  }
  const controller = new HarnessUiController(
    runtime,
    new HarnessProxy({ bridgeScript: createIdeBridgeScript(), log: line => output.appendLine(line) }),
    actions,
    vscode.env.language,
  )
  controllerRef.current = controller
  activeController = controller

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90)
  status.command = 'deepseekHarness.focus'
  status.name = 'DeepSeek Harness'
  status.show()
  const updateStatus = (): void => {
    const current = runtime.status
    status.text = current.state === 'ready' ? '$(sparkle) Harness' : current.state === 'starting' ? '$(sync~spin) Harness' : current.state === 'error' ? '$(error) Harness' : '$(circle-slash) Harness'
    status.tooltip = statusLabel(current)
  }
  updateStatus()
  const removeStatusListener = runtime.onDidChangeStatus(updateStatus)

  const panelSerializer = new HarnessPanelSerializer(controller)
  const disposables: vscode.Disposable[] = [
    output,
    status,
    vscode.window.registerWebviewViewProvider(HarnessSidebarProvider.viewType, new HarnessSidebarProvider(controller), { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewPanelSerializer('deepseekHarness.panel', panelSerializer),
    vscode.commands.registerCommand('deepseekHarness.focus', () => vscode.commands.executeCommand('workbench.view.extension.deepseekHarness')),
    vscode.commands.registerCommand('deepseekHarness.openPanel', () => createHarnessPanel(controller)),
    vscode.commands.registerCommand('deepseekHarness.newSession', async () => { await vscode.commands.executeCommand('workbench.view.extension.deepseekHarness'); await controller.ensureStarted(); controller.newSession() }),
    vscode.commands.registerCommand('deepseekHarness.sendSelection', () => sendEditorContext(controller, false)),
    vscode.commands.registerCommand('deepseekHarness.sendFile', () => sendEditorContext(controller, true)),
    vscode.commands.registerCommand('deepseekHarness.compareFiles', compareFiles),
    vscode.commands.registerCommand('deepseekHarness.start', () => controller.ensureStarted()),
    vscode.commands.registerCommand('deepseekHarness.stop', () => controller.stop()),
    vscode.commands.registerCommand('deepseekHarness.restart', () => controller.restart()),
    vscode.commands.registerCommand('deepseekHarness.refresh', () => controller.refresh()),
    vscode.commands.registerCommand('deepseekHarness.openBrowser', actions.openBrowser),
    vscode.commands.registerCommand('deepseekHarness.showLogs', actions.showLogs),
    vscode.commands.registerCommand('deepseekHarness.openSettings', actions.openSettings),
    { dispose: removeStatusListener },
    { dispose: () => { void controller.dispose() } },
  ]
  context.subscriptions.push(...disposables)

  if (settings.openOnStartup) void vscode.commands.executeCommand('workbench.view.extension.deepseekHarness')
}

export async function deactivate(): Promise<void> {
  const controller = activeController
  activeController = undefined
  if (controller !== undefined) await controller.dispose()
}
