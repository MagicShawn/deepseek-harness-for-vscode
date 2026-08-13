import * as vscode from 'vscode'
import type { HarnessUiController, ShellView } from './controller.js'

export class HarnessSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'deepseekHarness.sidebar'

  constructor(private readonly controller: HarnessUiController) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true }
    const shell: ShellView = {
      webview: view.webview,
      get visible() { return view.visible },
    }
    const detach = this.controller.attach(shell)
    view.onDidDispose(detach)
  }
}

export class HarnessPanelSerializer implements vscode.WebviewPanelSerializer {
  constructor(private readonly controller: HarnessUiController) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
    configurePanel(panel, this.controller)
  }
}

export function createHarnessPanel(controller: HarnessUiController): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'deepseekHarness.panel',
    'DeepSeek Harness',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  )
  configurePanel(panel, controller)
  return panel
}

function configurePanel(panel: vscode.WebviewPanel, controller: HarnessUiController): void {
  panel.webview.options = { enableScripts: true }
  const shell: ShellView = {
    webview: panel.webview,
    get visible() { return panel.visible },
  }
  const detach = controller.attach(shell)
  panel.onDidDispose(detach)
}
