# Changelog

## 0.1.2 — 2026-08-15

- Replace the CLI-first dashboard workflow with a single visual analysis form and button-based lifecycle actions.
- Add searchable installed-Skill discovery through the official Harness Skills API.
- Prioritize Skills invoked in the current Session, auto-select a single detection, and require a choice when several are present.
- Add Hybrid/Rules mode controls, duplicate-submit protection, progress, retry, and inline failure states.
- Hide visual-operation command cards while preserving official durable command events; manually entered CLI commands remain visible.
- Automatically select newly projected analysis results.

## 0.1.1 — 2026-08-15

- Add explicit cleanup commands for one analysis and for all active analyses in the current Session.
- Add path-safe, idempotent local artifact deletion with symbolic-link refusal.
- Add durable cleanup tombstones through the official command lifecycle so cleared analyses stay hidden after Session reload.
- Add UI cleanup controls, confirmation dialogs, and warnings that cleanup does not revert applied Skill changes.
- Preserve the append-only Harness Session audit trail and leave every other Session untouched.

## 0.1.0 — 2026-08-15

- Reframe the project as a native DeepSeek Harness bundle.
- Add explicit `/skill-insight` analyze, apply, revert, show, and list commands.
- Add bounded trace normalization, local redaction, deterministic findings, and hybrid model fallback.
- Add file-backed Skill proposals with frontmatter preservation and SHA-256 apply/revert guards.
- Add versioned local JSON/Markdown artifacts and Skill snapshots.
- Add a Harness `conversation.view` dashboard with analysis history, metrics, evidence, diff, and lifecycle actions.
- Persist projection data exclusively through the official command lifecycle and render a compact command card.
- Add Host, Client, UI, browser-bundle, artifact, safety, and command integration tests.
