# VS Code Marketplace Publishing Design

**Date:** 2026-08-15

## Goal

Publish the existing DeepSeek Harness UI extension to the Visual Studio Marketplace as a traceable, installable community extension, then mirror the exact release in GitHub.

## Release Identity

- Publisher display name: `MagicShawn`
- Permanent publisher ID: `magicshawn`
- Extension name: `deepseek-harness-ui`
- Marketplace extension ID: `magicshawn.deepseek-harness-ui`
- Marketplace display name: `DeepSeek Harness UI (Unofficial)`
- First Marketplace version: `0.1.1`
- Pricing label: `Free`

Version `0.1.1` is required because GitHub release `v0.1.0` already contains a package whose manifest uses the local-only publisher ID. Reusing `0.1.0` would make GitHub and Marketplace artifacts with the same version differ.

## Publisher Profile

The publisher profile will identify an independent open-source developer rather than DeepSeek:

- Description: `Independent open-source developer building AI-assisted developer tools and VS Code integrations.`
- Source repository: `https://github.com/MagicShawn/deepseek-harness-for-vscode`
- Support: `https://github.com/MagicShawn/deepseek-harness-for-vscode/issues`
- Company website, verified domain, LinkedIn, and Twitter remain empty because no corresponding identity was approved for this release.

No fallback publisher ID will be created automatically. If `magicshawn` is unavailable, publishing stops for a new user decision because a publisher ID cannot be renamed.

## Marketplace Presentation

The extension manifest will add the public repository, homepage, issue tracker, free-pricing label, Marketplace icon, and dark gallery banner. The display name and README will keep the word `Unofficial` prominent and retain the existing non-affiliation and trademark notice.

The Marketplace icon will be a 128 by 128 PNG derived from the existing activity-bar Harness symbol: a restrained indigo-to-blue background, white Harness outline, and no DeepSeek corporate logo. The existing theme-aware `media/activity.svg` remains unchanged for the VS Code Activity Bar.

The user-supplied `D:/Pictures/Screenshots/example.png` will be copied into the repository as `media/demo-overview.png` and used as the primary interface demonstration image in both README files and the Marketplace listing. The 2547 by 1515 screenshot will remain uncropped because the complete VS Code frame demonstrates that Harness is embedded beside the editor. Its current 142,659-byte PNG is already compact enough to retain at original resolution. The image contains no account credentials, API keys, conversations, or personal profile details.

## Package and Documentation Changes

- Change `publisher` from `local` to `magicshawn`.
- Change `version` from `0.1.0` to `0.1.1` in `package.json` and `package-lock.json`.
- Change the display name to `DeepSeek Harness UI (Unofficial)`.
- Add `repository`, `homepage`, `bugs`, `icon`, `galleryBanner`, and `pricing` metadata.
- Remove `--allow-missing-repository` from the packaging script.
- Add `media/demo-overview.png` and place it near the top of `README.md` and `README.zh-CN.md` with descriptive alt text.
- Add the 0.1.1 Marketplace-preparation entry to `CHANGELOG.md`.
- Keep the extension runtime, proxy, editor bridge, command IDs, settings IDs, and security behavior unchanged.

## Release Flow

1. Add manifest-level tests for the Marketplace identity and required metadata.
2. Apply the metadata, version, icon, interface screenshot, README, and changelog changes.
3. Run tests, TypeScript checking, ESLint, packaging, package-content inspection, and isolated VSIX installation.
4. Commit the release changes and push `main` so Marketplace README image URLs already resolve from the public repository.
5. Create publisher `magicshawn` in the signed-in Visual Studio Marketplace account.
6. Upload the verified `0.1.1` VSIX through the publisher management page, wait for validation, and confirm the public listing identifies `magicshawn.deepseek-harness-ui` at version `0.1.1`.
7. Create and push tag `v0.1.1`, then upload the exact VSIX to the corresponding GitHub Release.
8. Compare the local, Marketplace-downloaded when available, and GitHub Release artifact size and SHA-256 where each surface exposes the artifact.

## Failure Handling

- Stop before publisher creation if `magicshawn` is unavailable; do not create a suffixed identity without approval.
- Stop before upload if tests, lint, type checking, packaging, secret scanning, or isolated installation fails.
- Do not bypass Marketplace secret or malware warnings.
- Do not delete or overwrite the existing `v0.1.0` GitHub release.
- If Marketplace validation remains pending, report the pending state and preserve the authenticated management tab for continuation.
- If upload fails after publisher creation, keep the Publisher and correct the package; Publisher removal is not part of this release.
- Never expose Microsoft credentials, PATs, cookies, or authentication codes in logs or repository files.

## Success Criteria

- The Publisher is `MagicShawn` with permanent ID `magicshawn`.
- The public extension ID is `magicshawn.deepseek-harness-ui`.
- Marketplace reports version `0.1.1` and provides an install action.
- The public listing renders the supplied interface screenshot without a broken or insecure image URL.
- `code --install-extension magicshawn.deepseek-harness-ui` resolves after publication.
- All 88 existing tests plus Marketplace manifest tests pass.
- Type checking, ESLint, packaging, and isolated installation succeed.
- GitHub `main`, tag `v0.1.1`, GitHub Release, and Marketplace refer to the same release source and VSIX.
