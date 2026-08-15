# DeepSeek Harness UI for VS Code

[![VS Code](https://img.shields.io/badge/VS%20Code-1.90%2B-blue)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B%20or%2024%2B-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An unofficial, local-first VS Code workspace for the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

It keeps the official Harness experience (sessions, streaming, tools, approvals, questions, subagents, skills, model settings, workspaces) inside VS Code, while adding editor-native capabilities like file navigation, diff, runtime lifecycle control, and diagnostics.

> 简体中文说明：[`README.zh-CN.md`](README.zh-CN.md)

## UI preview

![DeepSeek Harness in VS Code](https://github.com/user-attachments/assets/51e7f2d1-10f8-48b8-aace-fb62d29e5a15)

## Highlights

- Official Harness UI in the Activity Bar or an editor tab.
- Managed local runtime **or** connect to an existing Harness URL.
- Runtime auto-discovery: custom command → `dsh` in PATH → `npx @deepseek-ai/dsh`.
- Start / stop / restart / refresh / browser-open / logs / status-bar controls.
- Add selection or full file to composer with clipboard-safe fallback.
- Open Harness `file://` links directly in VS Code (line + column).
- Compare local files with VS Code diff editor.
- Theme-aware, keyboard-friendly layout.
- Authenticated loopback proxy for HTTP, SSE, and WebSocket traffic.

## Requirements

- VS Code **1.90+**
- Node.js compatible with the installed DeepSeek Harness release  
  (current preview requires **22.19+** or **24+**)
- A configured DeepSeek Harness model/provider  
  (this extension does **not** read or store your API key)

If `dsh` is not available, the extension falls back to:

```sh
npx --yes @deepseek-ai/dsh web --host 127.0.0.1 --port 0
```

## Quick start

1. Install the VSIX: **Extensions → … → Install from VSIX…**
2. Click the **DeepSeek Harness** icon in the Activity Bar
3. Wait until the official web UI is ready
4. Open a source file and run:
   - **DeepSeek Harness: Add Selection to Context**, or
   - **DeepSeek Harness: Add File to Context**

## Commands

| Command | What it does |
| --- | --- |
| `DeepSeek Harness: Focus Chat` | Focuses the Activity Bar chat view |
| `DeepSeek Harness: Open in Editor` | Opens a persistent editor-tab workspace |
| `DeepSeek Harness: New Session` | Triggers the official UI new-session flow |
| `DeepSeek Harness: Add Selection to Context` | Copies and inserts selected code |
| `DeepSeek Harness: Add File to Context` | Copies and inserts the active file |
| `DeepSeek Harness: Compare Files` | Opens a two-file VS Code diff |
| `Start / Stop / Restart` | Manages the owned local runtime |
| `Show Logs` | Opens lifecycle and diagnostic logs |

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `deepseekHarness.connectionMode` | `auto` | `auto`, `managed`, or `external` |
| `deepseekHarness.externalUrl` | empty | Existing Harness web URL for auto/external mode |
| `deepseekHarness.command` | empty | Custom executable with optional prefix arguments |
| `deepseekHarness.port` | `0` | Managed web port; `0` requests a free OS port |
| `deepseekHarness.startupTimeout` | `60` | Startup timeout (seconds) |
| `deepseekHarness.openOnStartup` | `false` | Focuses the view on workspace open |

Example (existing Harness instance):

```jsonc
{
  "deepseekHarness.connectionMode": "external",
  "deepseekHarness.externalUrl": "http://127.0.0.1:3080"
}
```

Example (custom executable path on Windows):

```jsonc
{
  "deepseekHarness.connectionMode": "managed",
  "deepseekHarness.command": "\"C:\\Tools\\dsh.cmd\""
}
```

## Troubleshooting

**First launch times out**

- Run **DeepSeek Harness: Show Logs**
- If npm is still downloading the package, increase `deepseekHarness.startupTimeout`
- Confirm `node --version` meets Harness requirements

**Works in browser, not in VS Code**

- Run **DeepSeek Harness: Restart** and then **Refresh UI**
- Verify local security software allows loopback access to `127.0.0.1`

**Selection was not inserted**

- The formatted context is copied before insertion
- Focus the composer and paste manually if needed

**A file link does not open**

- Only existing regular files are allowed
- Relative paths must stay inside an open workspace
- HTTP links and traversal paths are rejected

## Security model

The extension starts (or connects to) the official web server, then hosts an authenticated reverse proxy on a random `127.0.0.1` port. The iframe receives a high-entropy bootstrap token, and later requests must remain same-origin.

Sensitive data stays owned by DeepSeek Harness. The extension does not log authorization headers, cookies, API keys, or credential-bearing URLs.

## Project status

DeepSeek Harness is still in developer preview and may ship breaking changes. This extension intentionally reuses the official UI to minimize protocol drift and keeps clipboard/manual fallbacks for resilience when upstream markup changes.

This community project is not affiliated with or endorsed by DeepSeek. DeepSeek and DeepSeek Harness are trademarks of their respective owners.

## License

MIT — see [`LICENSE`](LICENSE).
