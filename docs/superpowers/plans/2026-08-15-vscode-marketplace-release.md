# VS Code Marketplace Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `magicshawn.deepseek-harness-ui` version `0.1.1` to the Visual Studio Marketplace with complete metadata, a Marketplace icon, the supplied interface screenshot, and a matching GitHub release.

**Architecture:** Keep runtime code unchanged and treat the work as a release-surface layer: manifest metadata and tests define Marketplace identity, repository-hosted media powers the listing, and the already bundled extension remains the executable artifact. Push the release source before Marketplace upload so all README HTTPS assets resolve during validation; create the GitHub tag and Release only after Marketplace accepts the same VSIX.

**Tech Stack:** TypeScript, Vitest, Node.js 22+, PowerShell/System.Drawing for deterministic PNG generation on the release workstation, `@vscode/vsce` 3.6+, Visual Studio Marketplace browser management, Git/GitHub.

## Global Constraints

- Publisher display name is exactly `MagicShawn`; permanent publisher ID is exactly `magicshawn`.
- Extension ID is exactly `magicshawn.deepseek-harness-ui`; no suffixed fallback Publisher may be created without user approval.
- Marketplace display name is exactly `DeepSeek Harness UI (Unofficial)` and pricing is `Free`.
- Release version is exactly `0.1.1`; existing GitHub release `v0.1.0` must not be changed.
- Runtime, proxy, editor bridge, command IDs, setting IDs, and security behavior remain unchanged.
- `D:/Pictures/Screenshots/example.png` becomes `media/demo-overview.png` at its original 2048 by 1228 resolution.
- No Microsoft credential, PAT, cookie, authentication code, API key, or `.env` file may enter the repository or command output.
- Marketplace warnings and security scans may not be bypassed.

---

### Task 1: Marketplace Manifest Contract

**Files:**
- Modify: `test/manifest.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the root `package.json` loaded by `manifest()`.
- Produces: immutable Marketplace identity `magicshawn.deepseek-harness-ui@0.1.1` and public listing metadata used by `vsce`.

- [ ] **Step 1: Extend the manifest test type and add the failing Marketplace identity test**

Add these fields to `Manifest`:

```ts
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
  // existing fields remain here
}
```

Add this test inside `describe('extension manifest', ...)`:

```ts
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
```

- [ ] **Step 2: Run the targeted test and verify the red state**

Run:

```powershell
npx vitest run test/manifest.test.ts
```

Expected: FAIL because the manifest still reports `version: 0.1.0`, `publisher: local`, and lacks Marketplace metadata.

- [ ] **Step 3: Bump the npm version without creating a tag**

Run:

```powershell
npm version 0.1.1 --no-git-tag-version
```

Expected: `package.json` and the root package entries in `package-lock.json` report `0.1.1`; no Git tag exists.

- [ ] **Step 4: Add the approved Marketplace metadata**

Update the top-level manifest fields to include:

```json
{
  "displayName": "DeepSeek Harness UI (Unofficial)",
  "version": "0.1.1",
  "publisher": "magicshawn",
  "icon": "media/icon.png",
  "pricing": "Free",
  "repository": {
    "type": "git",
    "url": "https://github.com/MagicShawn/deepseek-harness-for-vscode.git"
  },
  "homepage": "https://github.com/MagicShawn/deepseek-harness-for-vscode#readme",
  "bugs": {
    "url": "https://github.com/MagicShawn/deepseek-harness-for-vscode/issues"
  },
  "galleryBanner": {
    "color": "#111827",
    "theme": "dark"
  }
}
```

Change the package script to:

```json
"package": "npm run build && vsce package --out dist/deepseek-harness-ui-0.1.1.vsix"
```

- [ ] **Step 5: Run the targeted test and verify the green state**

Run:

```powershell
npx vitest run test/manifest.test.ts
```

Expected: all manifest tests PASS.

- [ ] **Step 6: Commit the manifest contract**

```powershell
git add package.json package-lock.json test/manifest.test.ts
git commit -m "chore: prepare Marketplace manifest"
```

### Task 2: Marketplace Media and Listing Copy

**Files:**
- Create: `scripts/generate-marketplace-icon.ps1`
- Create: `media/icon.png`
- Create: `media/demo-overview.png`
- Modify: `test/manifest.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `media/activity.svg` as the established symbol and `D:/Pictures/Screenshots/example.png` as the approved demonstration screenshot.
- Produces: `media/icon.png` for the manifest and HTTPS-backed README image markup rendered by Marketplace.

- [ ] **Step 1: Add failing media and README tests**

Import `access` with `readFile`, then add:

```ts
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
```

- [ ] **Step 2: Run the media test and verify the red state**

Run:

```powershell
npx vitest run test/manifest.test.ts -t "ships valid Marketplace media"
```

Expected: FAIL because `media/icon.png` and `media/demo-overview.png` do not exist.

- [ ] **Step 3: Create a reproducible 128 by 128 Marketplace icon generator**

Create `scripts/generate-marketplace-icon.ps1`:

```powershell
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$target = [System.IO.Path]::GetFullPath($OutputPath)
$parent = [System.IO.Path]::GetDirectoryName($target)
if ([string]::IsNullOrWhiteSpace($parent)) {
  throw 'The icon output path must include a parent directory.'
}
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent | Out-Null
}

$bitmap = [System.Drawing.Bitmap]::new(128, 128)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 128, 128),
  [System.Drawing.ColorTranslator]::FromHtml('#312E81'),
  [System.Drawing.ColorTranslator]::FromHtml('#2563EB'),
  [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 8)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.FillRectangle($gradient, 0, 0, 128, 128)

  $path.StartFigure()
  $path.AddLine(27, 28, 56, 28)
  $path.AddBezier(56, 28, 86, 28, 102, 43, 102, 64)
  $path.AddBezier(102, 85, 86, 100, 56, 100)
  $path.AddLine(56, 100, 27, 100)
  $path.CloseFigure()

  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($pen, $path)
  $graphics.DrawLine($pen, 50, 46, 50, 82)
  $graphics.DrawLine($pen, 50, 64, 80, 64)
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $pen.Dispose()
  $path.Dispose()
  $gradient.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
```

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-marketplace-icon.ps1 -OutputPath media/icon.png
```

Expected: `media/icon.png` is a 128 by 128 PNG.

- [ ] **Step 4: Copy the approved screenshot without modification**

Run:

```powershell
Copy-Item -LiteralPath 'D:\Pictures\Screenshots\example.png' -Destination 'media\demo-overview.png'
```

Expected: the source and destination SHA-256 hashes match and the destination remains 2048 by 1228.

- [ ] **Step 5: Add the screenshot to both Marketplace README variants**

Place this immediately after the introductory paragraphs in `README.md`:

```markdown
![DeepSeek Harness UI embedded beside the VS Code editor](https://raw.githubusercontent.com/MagicShawn/deepseek-harness-for-vscode/main/media/demo-overview.png)
```

Place this at the corresponding location in `README.zh-CN.md`:

```markdown
![DeepSeek Harness UI 嵌入 VS Code 编辑器侧栏的界面演示](https://raw.githubusercontent.com/MagicShawn/deepseek-harness-for-vscode/main/media/demo-overview.png)
```

- [ ] **Step 6: Document version 0.1.1**

Insert above the 0.1.0 entry in `CHANGELOG.md`:

```markdown
## 0.1.1 — 2026-08-15

- Prepare the extension for its first Visual Studio Marketplace release under publisher `magicshawn`.
- Add public repository, support, pricing, gallery, and Marketplace icon metadata.
- Add an interface demonstration image to the English and Chinese Marketplace documentation.
```

- [ ] **Step 7: Verify media visually and run the media test**

Open `media/icon.png` and `media/demo-overview.png` for visual inspection, then run:

```powershell
npx vitest run test/manifest.test.ts
```

Expected: all manifest and media tests PASS; the icon is crisp at 128 by 128 and the supplied screenshot is unchanged.

- [ ] **Step 8: Commit media and listing copy**

```powershell
git add scripts/generate-marketplace-icon.ps1 media/icon.png media/demo-overview.png README.md README.zh-CN.md CHANGELOG.md test/manifest.test.ts
git commit -m "docs: add Marketplace presentation assets"
```

### Task 3: Release Candidate Verification

**Files:**
- Generated, ignored: `dist/extension.cjs`
- Generated, ignored: `dist/deepseek-harness-ui-0.1.1.vsix`

**Interfaces:**
- Consumes: the committed 0.1.1 source and Marketplace assets.
- Produces: one verified VSIX and its SHA-256 for Marketplace and GitHub.

- [ ] **Step 1: Run the complete quality gate**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: every test passes with zero TypeScript or ESLint errors, and `dist/extension.cjs` is rebuilt from the release source.

- [ ] **Step 2: Inspect the exact package file list**

```powershell
npx vsce ls --tree
```

Expected: runtime source, tests, plans, lockfile, and logs are excluded; the compiled extension, both READMEs, license, changelog, icon, activity icon, and demo screenshot are included.

- [ ] **Step 3: Build the release VSIX**

```powershell
npm run package
```

Expected: `dist/deepseek-harness-ui-0.1.1.vsix` is created without missing-repository, SVG listing-icon, secret, or `.env` warnings.

- [ ] **Step 4: Verify installation in isolated VS Code directories**

Create two explicit directories below `$env:TEMP\deepseek-harness-vscode-marketplace-v011`, then run:

```powershell
code --user-data-dir "$env:TEMP\deepseek-harness-vscode-marketplace-v011\user-data" --extensions-dir "$env:TEMP\deepseek-harness-vscode-marketplace-v011\extensions" --install-extension "$PWD\dist\deepseek-harness-ui-0.1.1.vsix" --force
code --user-data-dir "$env:TEMP\deepseek-harness-vscode-marketplace-v011\user-data" --extensions-dir "$env:TEMP\deepseek-harness-vscode-marketplace-v011\extensions" --list-extensions --show-versions
```

Expected: output contains `magicshawn.deepseek-harness-ui@0.1.1`.

- [ ] **Step 5: Record the release hash and clean status**

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'dist\deepseek-harness-ui-0.1.1.vsix'
git status --short --branch
```

Expected: a SHA-256 is recorded and tracked files are clean.

### Task 4: Publish Release Source to GitHub Main

**Files:** None beyond committed Tasks 1 and 2.

**Interfaces:**
- Consumes: verified commits and VSIX hash from Task 3.
- Produces: public README asset URLs that resolve before Marketplace validation.

- [ ] **Step 1: Confirm local history and remote divergence**

```powershell
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git fetch origin
git rev-list --left-right --count origin/main...HEAD
```

Expected: no tracked changes; local commits are only the approved design, plan, manifest, and presentation work; remote has no unmerged commits.

- [ ] **Step 2: Push main without force**

```powershell
git push origin main
```

Expected: `origin/main` advances to local `HEAD`.

- [ ] **Step 3: Verify the demonstration image resolves publicly**

Request:

```text
https://raw.githubusercontent.com/MagicShawn/deepseek-harness-for-vscode/main/media/demo-overview.png
```

Expected: HTTP 200 and PNG content matching `media/demo-overview.png`.

### Task 5: Create the Visual Studio Marketplace Publisher

**Files:** None.

**Interfaces:**
- Consumes: signed-in Microsoft Marketplace management session.
- Produces: Publisher `MagicShawn` with permanent ID `magicshawn`.

- [ ] **Step 1: Check Publisher ID availability in the visible create form**

Fill Name with `MagicShawn` and ID with `magicshawn`, then inspect field validation before submitting.

Expected: both fields are accepted. If `magicshawn` is unavailable, stop without submitting and request a new ID.

- [ ] **Step 2: Fill the approved public profile**

Use:

```text
Description: Independent open-source developer building AI-assisted developer tools and VS Code integrations.
Support: https://github.com/MagicShawn/deepseek-harness-for-vscode/issues
Source code repository: https://github.com/MagicShawn/deepseek-harness-for-vscode
```

Leave verified domain, company website, LinkedIn, and Twitter empty. Upload `media/icon.png` as the Publisher logo.

- [ ] **Step 3: Submit Publisher creation**

Select Create once. If reCAPTCHA presents an interactive challenge, ask the user for explicit CAPTCHA permission and complete only that challenge after approval.

Expected: management page shows Publisher `MagicShawn` / `magicshawn`.

### Task 6: Upload and Validate the Marketplace Extension

**Files:**
- Upload: `dist/deepseek-harness-ui-0.1.1.vsix`

**Interfaces:**
- Consumes: verified VSIX and Publisher `magicshawn`.
- Produces: public Marketplace listing `magicshawn.deepseek-harness-ui@0.1.1`.

- [ ] **Step 1: Open the VS Code extension upload flow**

From Publisher management, choose New Extension, then Visual Studio Code, and select the verified VSIX.

- [ ] **Step 2: Inspect validation before final submission**

Confirm extension ID, display name, version, icon, README screenshot, repository, license, and support links. Do not continue past any secret, malware, policy, or identity warning.

- [ ] **Step 3: Submit and monitor validation**

Submit once and wait for Marketplace status to leave processing. If status remains pending beyond the active session, preserve the management tab and report the exact pending state.

- [ ] **Step 4: Verify the public listing**

Open:

```text
https://marketplace.visualstudio.com/items?itemName=magicshawn.deepseek-harness-ui
```

Expected: Publisher `MagicShawn`, version `0.1.1`, install action, repository/support/license links, and the interface screenshot are visible.

- [ ] **Step 5: Verify Marketplace installation**

```powershell
code --install-extension magicshawn.deepseek-harness-ui --force
```

Expected: VS Code resolves and installs version `0.1.1` from Marketplace.

### Task 7: Tag and Mirror the Accepted Release on GitHub

**Files:**
- Upload: `dist/deepseek-harness-ui-0.1.1.vsix`

**Interfaces:**
- Consumes: Marketplace-accepted commit and exact verified VSIX.
- Produces: Git tag `v0.1.1` and matching GitHub Release asset.

- [ ] **Step 1: Create and push a lightweight release tag**

```powershell
git tag v0.1.1
git push origin v0.1.1
```

Expected: remote tag `v0.1.1` points to the same commit as `origin/main`.

- [ ] **Step 2: Create the GitHub Release and upload the exact VSIX**

Use the authenticated GitHub API credential already managed by Git Credential Manager. Create release `v0.1.1` with title `DeepSeek Harness UI v0.1.1`, then upload `dist/deepseek-harness-ui-0.1.1.vsix` as `application/octet-stream`. Keep the token only in process memory and print only release and asset URLs.

- [ ] **Step 3: Verify final remote state and artifact integrity**

```powershell
git ls-remote origin refs/heads/main refs/tags/v0.1.1
Get-FileHash -Algorithm SHA256 -LiteralPath 'dist\deepseek-harness-ui-0.1.1.vsix'
git status --short --branch
```

Download the GitHub Release asset into memory and verify its byte length and SHA-256 equal the local VSIX. Confirm `main`, `v0.1.1`, Marketplace `0.1.1`, and GitHub Release all identify the same release.
