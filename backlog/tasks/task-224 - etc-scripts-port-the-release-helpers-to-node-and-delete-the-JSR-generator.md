---
id: TASK-224
title: 'etc/scripts: port the release helpers to node and delete the JSR generator'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - scripts
  - release
  - deno-removal
milestone: m-1
dependencies:
  - TASK-198
priority: high
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port these scripts to node:fs/promises, node:child_process, node:os and process:
- preflight-npm-consumer.ts (12 Deno lines); also remove its bun row from the --runtime option
- update-homebrew-formula.ts (11 Deno lines)
- update-nix-hashes.ts (3 Deno lines)
They stay free of workspace imports. These ports are deliberately small, because M3-T10 replaces the two updaters in Go. Delete hybrid-sniffer.ts if nothing uses it; otherwise port it.
Per decision jsr-publishing, delete gen-jsr-manifests.ts and the five laroux deno.extra.json files, moving their publish.include lists into package.json `files` through the integration agent. Remove the generated deno.json and .deno_compile_bundle rules from .gitignore.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-15 (Keep Bun support).

Plan key: M1-T30. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -wn 'Deno\|bun' etc/scripts` returns nothing
- [ ] #2 `node etc/scripts/update-homebrew-formula.ts --dry-run` and the nix dry run produce the same output as before for v4.5.2 inputs
- [ ] #3 No deno.extra.json and no gen-jsr-manifests.ts remain
- [ ] #4 `node --test 'etc/scripts/*.test.ts'` passes from the repo root
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1; grep and a run):
- Tests after the codemod: dist-utils.test.ts 15/15 and package-export-roots.test.ts 3/3 pass (their Deno lines were Deno.test only).
- Scripts that fail under node on the first Deno.*: preflight-npm-consumer.ts (Deno. 12, Bun 3, a --runtime option with a bun row), update-homebrew-formula.ts (11), update-nix-hashes.ts (3), hybrid-sniffer.ts (3; its only reference is .eser/manifest.yml), gen-jsr-manifests.ts (10). release-notes-from-changelog.ts and package-export-roots.ts already run.
- gen-jsr-manifests is referenced from .eser/manifest.yml, .github/workflows/build.yml:780, .gitignore, pkg/@eserstack/codebase/release.ts, AGENTS.md, docs/agents/{documentation-and-tooling,release-and-ci,workflow}.md and security-report.md.
- deno.extra.json files: laroux, laroux-bundler, laroux-react, laroux-server, laroux-runtime and posts (posts is TASK-214).
- .gitignore:50 (`/pkg/@eserstack/*/deno.json`), :52-56 (`.deno_compile_bundle_*.mjs`), :61 (`deno task cli docs`).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.
<!-- SECTION:NOTES:END -->
