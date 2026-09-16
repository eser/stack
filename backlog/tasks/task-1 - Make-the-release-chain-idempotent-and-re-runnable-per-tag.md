---
id: TASK-1
title: Make the release chain idempotent and re-runnable per tag
status: Done
assignee: []
created_date: '2026-09-13 16:51'
updated_date: '2026-09-13 18:02'
labels:
  - ci
  - release
dependencies: []
references:
  - .github/workflows/build.yml
  - pkg/@eserstack/codebase/release.ts
  - pkg/@eserstack/codebase/release-notes.ts
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release is one all-or-nothing chain: 40 JSR packages, 3 npm bundles, 6 ajan platform packages, the GitHub Release, Homebrew and Nix. When any late stage fails, the only recovery today is delete-and-repush the tag, and until 2026-09-13 that also burned the version number because publish was not idempotent. JSR and npm now skip already-published versions, release notes fall back to edit, and asset upload uses --clobber. What is still missing is a way to re-run the stages after publish for an existing tag without touching git at all.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Integrity Pipeline accepts workflow_dispatch with a tag input and runs only the post-publish stages (release notes, asset upload, Homebrew, Nix) against that tag
- [x] #2 Re-running the full chain for an already-published tag completes green: deno publish skips existing versions, npm publish steps skip existing versions, gh release edit is used when the release exists
- [x] #3 The Publish ajan packages job skips platform packages whose version already exists on npm and reports clearly which ones failed for lack of trusted publishing, without masking real publish errors
- [x] #4 Documented in the release-management skill: how to resume a failed release without re-tagging
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
workflow_dispatch now takes tag + stage (post-publish|full). release-gate resolves the mode and exports tag/resume outputs; validate, smoke tests and publish are skipped on post-publish resume while release-notes, compile-binaries, publish-ajan, upload-assets, Homebrew and Nix run against the tag's checkout (every checkout follows the resumed tag; concurrency keys on it). publish-ajan continues past npm 404-on-PUT (no trusted publisher), lists those packages in the step summary and fails at the end; any other publish error fails immediately. Added .github/actionlint.yaml so actionlint knows the ubicloud labels. release-management rules rewritten: resume first, rerelease only for commits that touch nothing already published, patch otherwise.
<!-- SECTION:NOTES:END -->
