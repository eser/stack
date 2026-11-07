---
id: TASK-375
title: 'docs: package READMEs install from npm'
status: Done
assignee: []
created_date: '2026-11-07 16:30'
labels:
  - docs
milestone: m-2
dependencies: []
priority: medium
ordinal: 378000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Package READMEs under pkg/@eserstack named `pnpm add jsr:@eserstack/<name>` as the install line, for example crypto/README.md:8, webtransport/README.md:8 and httpclient/README.md:14, and others linked to jsr.io. Those lines install the frozen 4.5.x (decision-5), and npm shows each README on the package page.

Replace them with the npm install form, matching the install wording that already-converted READMEs use. Keep historical mentions where they correctly describe the freeze. Check that no doc-check test or validator breaks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -n 'jsr:@eserstack' -- 'pkg/@eserstack/**/README.md'` matches nothing, or each remaining match is listed in the notes with its reason
- [x] #2 The jsr.io links are handled the same way
- [x] #3 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (lines at 4665f99e): the READMEs were written while JSR was the registry, for example pkg/@eserstack/crypto/README.md:8. The freeze note added at the top of each (line 3 onwards) gives the npm form, but the install line under it still gave the JSR one. pkg/@eserstack/laroux-bundler/README.md:9 and :44 and the recipe .eser/recipes/library-pkg/README.md:6 were the converted form, `pnpm add @eserstack/<name>`, and the recipe's Links footer the form `[npm package](https://www.npmjs.com/package/@eserstack/<name>)`.

Counts at 4665f99e: 35 `jsr:@eserstack` matches in 34 READMEs (laroux-react has two), and 21 jsr.io matches in 11 READMEs. The task as filed said 35 READMEs and 12 links. Together they touch 36 files.

Changes:

- Every `pnpm add jsr:@eserstack/<name>` became `pnpm add @eserstack/<name>`, in the blockquote install lines, the "Install it with" sentences (formats, httpclient, mux), laroux-react's Installation block and noskills README:21.
- Cross-package jsr.io links in laroux-bundler, laroux-react, laroux-server and streams now point at `https://www.npmjs.com/package/@eserstack/<name>`, with the descriptions kept. Lines the longer URL pushed past 80 columns were wrapped after the link.
- `[JSR package](...)` footer links became `[npm package](...)`. The words after them, "the API reference generated from source" or "symbol-level API reference, generated from source", are dropped on purpose: JSR generated that reference and an npm page does not, so the sentence would be false (documentation-conventions, Docs Change With the Code). The JSR reference describes 4.5.x, which 5.0.0 breaks in the ways the CHANGELOG lists.
- fp/README.md:51 is sample data for a `fetch` example, not a link. It got the npm URL too so that the page holds no jsr.io address.
- The 37 names these lines and links use were checked against each package.json: all are non-private with `exports`, so each is one of the libraries npm gets from 5.0.0 (docs/agents/release-and-ci.md, Libraries).

Results:

- `git grep -n 'jsr:@eserstack' -- 'pkg/@eserstack/**/README.md'` and `git grep -n 'jsr\.io' -- 'pkg/@eserstack/**/README.md'` both match nothing, so no remaining match needs a reason.
- No test or validator reads these lines: `git grep` for `JSR is frozen`, `API reference generated` and `symbol-level` in .ts, .go, .yml and .json files finds only the unrelated runtime notice in pkg/@eserstack/cli/main.ts:131, and `pnpm exec oxfmt --check` on the 36 files passes.

Kept, each still true:

- The "**Note:** JSR is frozen at 4.5.x" blockquote at the top of each README, which describes the freeze.
- cli/README.md:285 and codebase/README.md:60: a version on JSR or npm cannot be published again, which holds for the 4.5.x on JSR.
- kit/README.md:104: `jsr` is a field of `RecipeDependencies` (kit recipes/registry-schema.ts:63).
- laroux-bundler/README.md:402 and :406: its Upgrading section, on what 5.0.0 removes.

Seen and left out, as outside `pkg/@eserstack/**/README.md`: pkg/@eserstack/kit/recipes/dependency-resolver.ts:31 and registry-schema.ts:63 use `jsr:@eserstack/fp` as JSDoc examples of a field that still exists, and security-report.md:1774 is an audit report.

`pnpm ok` (go run ./cmd/eser ok) in this worktree on 2026-11-07: all 34 steps passed, "All checks passed!", Go included.
<!-- SECTION:NOTES:END -->
