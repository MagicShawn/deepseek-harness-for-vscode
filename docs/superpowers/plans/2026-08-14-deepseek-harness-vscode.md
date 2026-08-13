# DeepSeek Harness VS Code UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a production-ready VS Code extension that embeds the official DeepSeek Harness Web UI and adds editor-native context, navigation, diff, lifecycle, and diagnostics.

**Architecture:** A TypeScript extension host owns one Harness process and one authenticated loopback reverse proxy. A small Webview shell embeds the proxied official SPA; a narrowly scoped injected bridge passes context and file-link actions to VS Code without reimplementing the Harness protocol.

**Tech Stack:** TypeScript, VS Code Extension API, Node HTTP/HTTPS/net, WebSocket upgrade piping, esbuild, Vitest, ESLint, `@vscode/vsce`.

## Global Constraints

- VS Code minimum version is 1.90.
- The proxy binds only to `127.0.0.1` and uses a high-entropy path token.
- The extension never stores or logs API keys, authorization headers, cookies, or credential-bearing query strings.
- The official Harness UI owns sessions, approvals, questions, tools, models, settings, and subagents.
- The deliverable includes a verified installable VSIX.

---

### Task 1: Project skeleton and pure domain contracts

**Files:** create `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `src/domain/*.ts`, and `test/domain/*.test.ts`.

**Interfaces:** produce `resolveLaunchPlan(config, pathAvailable)`, `parseHarnessUrl(line)`, `formatEditorContext(selection)`, and `parseFileLocation(value)` as pure functions.

- [ ] Write failing tests for managed/external/auto resolution, quoted custom commands, official URL log shapes, Windows/POSIX file locations, and selected/full-file Markdown context.
- [ ] Run `npm test` and verify missing module/export failures.
- [ ] Add minimal types and implementations.
- [ ] Run focused tests and the full suite.
- [ ] Commit the independently testable domain layer.

### Task 2: Runtime manager

**Files:** create `src/runtime/process.ts`, `src/runtime/manager.ts`, `src/runtime/health.ts`; test under `test/runtime/`.

**Interfaces:** produce `HarnessRuntimeManager.start(): Promise<RuntimeReady>`, `stop()`, `restart()`, `status`, `onDidChangeStatus`, and dependency-injected `ProcessSpawner`/`HealthProbe`.

- [ ] Write failing state-machine tests for external health success/failure, managed stdout URL discovery, timeout, unexpected exit, idempotent concurrent start, restart, and owned-process cleanup.
- [ ] Verify failures are behavioral rather than setup errors.
- [ ] Implement the smallest manager satisfying the tests.
- [ ] Run runtime and full tests, then refactor duplicated transitions.
- [ ] Commit runtime lifecycle support.

### Task 3: Authenticated reverse proxy and bridge injection

**Files:** create `src/proxy/server.ts`, `src/proxy/httpForward.ts`, `src/proxy/bridge.ts`; test under `test/proxy/`.

**Interfaces:** produce `HarnessProxy.start(upstream): Promise<ProxyReady>`, `updateUpstream(url)`, `stop()`, `injectBridge(html, script)`, and transparent HTTP/upgrade forwarding.

- [ ] Write failing fixture-server tests for token rejection, GET/static/POST/SSE forwarding, header rewriting, HTML bridge injection, 502 behavior, and WebSocket echo.
- [ ] Run tests and confirm expected proxy absence/failures.
- [ ] Implement loopback server, streaming forwarder, HTML transform, and upgrade socket tunnel.
- [ ] Run proxy and full tests; verify sockets close on disposal.
- [ ] Commit proxy support.

### Task 4: VS Code Webview and editor integration

**Files:** create `src/extension.ts`, `src/ui/provider.ts`, `src/ui/html.ts`, `src/ide/context.ts`, `src/ide/navigation.ts`, `media/*`; add Extension Host tests.

**Interfaces:** register view `deepseekHarness.sidebar`, commands `openPanel`, `newSession`, `sendSelection`, `sendFile`, `openFile`, `compareFiles`, `start`, `stop`, `restart`, `refresh`, `showLogs`, and `openSettings`.

- [ ] Write failing tests against a narrow VS Code adapter for command registration, context delivery, safe file opening, diff URI creation, and webview message validation.
- [ ] Verify failures.
- [ ] Implement provider, toolbar shell, localized copy, command handlers, and injected composer/file-link bridge.
- [ ] Run tests, typecheck, and build; inspect narrow and editor-panel HTML states.
- [ ] Commit the complete interactive extension.

### Task 5: Packaging, documentation, and completion verification

**Files:** create `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, `LICENSE`, `.vscodeignore`, icon assets, and package metadata.

**Interfaces:** `npm run package` produces `dist/deepseek-harness-ui-<version>.vsix`.

- [ ] Add manifest tests/assertions for commands, settings, views, menus, activation events, icon paths, license, and packaged file allowlist.
- [ ] Verify the assertions fail before metadata is complete.
- [ ] Complete documentation and packaging metadata; generate original non-infringing vector icons.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run package`, inspect VSIX contents, and install it into a temporary VS Code extensions directory.
- [ ] Launch an Extension Development Host or headless smoke path with a fixture Harness server; capture evidence for sidebar, proxy, context, navigation, and lifecycle.
- [ ] Commit the release candidate and report the absolute VSIX path plus exact validation results.

