import type { RuntimeStatus } from '../runtime/manager.js'

export interface ShellHtmlOptions {
  nonce: string
  locale: string
  initialStatus: RuntimeStatus
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
}

export function createShellHtml(options: ShellHtmlOptions): string {
  const chinese = options.locale.toLowerCase().startsWith('zh')
  const copy = chinese ? {
    title: 'DeepSeek Harness',
    starting: '正在启动 DeepSeek Harness…',
    stopped: 'DeepSeek Harness 尚未运行',
    start: '启动 DeepSeek Harness',
    retry: '重新连接',
    logs: '打开日志',
    settings: '设置',
    open: '在浏览器中打开',
    restart: '重启',
    failed: '连接失败',
  } : {
    title: 'DeepSeek Harness',
    starting: 'Starting DeepSeek Harness…',
    stopped: 'DeepSeek Harness is not running',
    start: 'Start DeepSeek Harness',
    retry: 'Reconnect',
    logs: 'Open logs',
    settings: 'Settings',
    open: 'Open in browser',
    restart: 'Restart',
    failed: 'Connection failed',
  }
  const copyJson = jsonForScript(copy)
  const statusJson = jsonForScript(options.initialStatus)

  return `<!doctype html>
<html lang="${chinese ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}'; frame-src http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*;">
  <style nonce="${options.nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); font: 13px var(--vscode-font-family); }
    body { display: grid; grid-template-rows: 36px 1fr; }
    .toolbar { display: flex; align-items: center; min-width: 0; gap: 4px; padding: 0 6px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
    .brand { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .dot { width: 7px; height: 7px; margin-right: 3px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
    .dot.ready { background: var(--vscode-testing-iconPassed, #2ea043); }
    .dot.starting { background: var(--vscode-progressBar-background, #3794ff); animation: pulse 1.1s ease-in-out infinite; }
    .dot.error { background: var(--vscode-testing-iconFailed, #f85149); }
    button { color: var(--vscode-button-secondaryForeground); background: transparent; border: 0; border-radius: 4px; padding: 5px 7px; font: inherit; cursor: pointer; }
    button:hover { background: var(--vscode-toolbar-hoverBackground); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .surface { position: relative; min-height: 0; }
    iframe { width: 100%; height: 100%; border: 0; background: var(--vscode-editor-background); }
    .state { position: absolute; inset: 0; display: grid; place-items: center; padding: 28px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); z-index: 2; }
    .card { width: min(360px, 100%); text-align: center; }
    .mark { width: 42px; height: 42px; margin: 0 auto 16px; display: grid; place-items: center; border: 1px solid var(--vscode-panel-border); border-radius: 13px; color: var(--vscode-textLink-foreground); font-size: 20px; font-weight: 700; }
    h1 { margin: 0 0 8px; font-size: 16px; }
    p { margin: 0 0 16px; color: var(--vscode-descriptionForeground); line-height: 1.5; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; }
    .actions button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 7px 11px; }
    .actions button:hover { background: var(--vscode-button-hoverBackground); }
    .actions .secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    [hidden] { display: none !important; }
    @keyframes pulse { 50% { opacity: .35; } }
    @media (prefers-reduced-motion: reduce) { .dot.starting { animation: none; } }
  </style>
</head>
<body>
  <header class="toolbar">
    <span id="dot" class="dot" aria-hidden="true"></span>
    <span class="brand">${copy.title}</span>
    <button id="open" title="${copy.open}" aria-label="${copy.open}">↗</button>
    <button id="restart" title="${copy.restart}" aria-label="${copy.restart}">↻</button>
  </header>
  <main class="surface">
    <iframe id="harness" title="DeepSeek Harness" hidden></iframe>
    <section id="state" class="state">
      <div class="card">
        <div class="mark" aria-hidden="true">D</div>
        <h1 id="headline">${copy.stopped}</h1>
        <p id="detail"></p>
        <div class="actions">
          <button id="primary">${copy.start}</button>
          <button id="logs" class="secondary">${copy.logs}</button>
          <button id="settings" class="secondary">${copy.settings}</button>
        </div>
      </div>
    </section>
  </main>
  <script nonce="${options.nonce}">
    const vscode = acquireVsCodeApi();
    const copy = ${copyJson};
    const frame = document.getElementById('harness');
    const state = document.getElementById('state');
    const dot = document.getElementById('dot');
    const headline = document.getElementById('headline');
    const detail = document.getElementById('detail');
    const primary = document.getElementById('primary');
    let runtime = ${statusJson};

    const command = command => vscode.postMessage({ type: 'command', command });
    document.getElementById('open').addEventListener('click', () => command('openBrowser'));
    document.getElementById('restart').addEventListener('click', () => command('restart'));
    document.getElementById('logs').addEventListener('click', () => command('showLogs'));
    document.getElementById('settings').addEventListener('click', () => command('openSettings'));
    primary.addEventListener('click', () => command(runtime.state === 'error' ? 'restart' : 'start'));

    function renderStatus(status) {
      runtime = status;
      dot.className = 'dot ' + status.state;
      if (status.state === 'ready') return;
      frame.hidden = true;
      state.hidden = false;
      if (status.state === 'starting') {
        headline.textContent = copy.starting;
        detail.textContent = '';
        primary.hidden = true;
      } else if (status.state === 'error') {
        headline.textContent = copy.failed;
        detail.textContent = status.message || '';
        primary.textContent = copy.retry;
        primary.hidden = false;
      } else {
        headline.textContent = copy.stopped;
        detail.textContent = '';
        primary.textContent = copy.start;
        primary.hidden = false;
      }
    }

    window.addEventListener('message', event => {
      if (event.source === frame.contentWindow && event.data && event.data.source === 'dsh-vscode-bridge') {
        const value = event.data;
        if (value.type === 'openFile' && typeof value.value === 'string') vscode.postMessage({ type: 'openFile', value: value.value });
        if (value.type === 'contextResult' && typeof value.ok === 'boolean') vscode.postMessage({ type: 'contextResult', ok: value.ok });
        return;
      }
      if (event.source !== window || !event.data || event.data.source !== 'dsh-vscode-extension') return;
      switch (event.data.type) {
        case 'runtimeStatus':
          renderStatus(event.data.status);
          break;
        case 'loadHarness': {
          let url;
          try { url = new URL(event.data.url); } catch { return; }
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
          if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return;
          frame.src = url.href;
          frame.hidden = false;
          state.hidden = true;
          break;
        }
        case 'insertContext':
          frame.contentWindow?.postMessage({ source: 'dsh-vscode-shell', type: 'insertContext', text: event.data.text }, '*');
          break;
        case 'newSession':
          frame.contentWindow?.postMessage({ source: 'dsh-vscode-shell', type: 'newSession' }, '*');
          break;
      }
    });
    frame.addEventListener('load', () => { if (frame.src) { frame.hidden = false; state.hidden = true; } });
    renderStatus(runtime);
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`
}
