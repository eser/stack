---
id: TASK-224
title: 'etc/scripts: port the release helpers to node and delete the JSR generator'
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
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
- [x] #1 `git grep -wn 'Deno\|bun' etc/scripts` returns nothing
- [x] #2 `node etc/scripts/update-homebrew-formula.ts --dry-run` and the nix dry run produce the same output as before for v4.5.2 inputs
- [ ] #3 No deno.extra.json and no gen-jsr-manifests.ts remain
- [x] #4 `node --test 'etc/scripts/*.test.ts'` passes from the repo root
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

TASK-224 (2026-10-25, node 26.12.1):
- preflight-npm-consumer.ts runs on node:child_process, node:fs/promises, node:os and node:process. `--runtime` accepts only node, and the bundle runs under `process.execPath`, the Node that runs the script. `run` and `parseOptions(args)` are exported; preflight-npm-consumer.test.ts covers them (5 tests, written failing first).
- update-homebrew-formula.ts and update-nix-hashes.ts were already gone: commit 7d958e2f moved them to Go (`eser dev homebrew`, `eser dev nix-hashes`). AC #2 holds through TestDevHomebrewAndNixDryRun in cmd/eser/dev_test.go (`go test ./cmd/eser/` passes).
- Deleted gen-jsr-manifests.ts and hybrid-sniffer.ts (its only reference was a validate-runtime-js-apis exclude).
- AC #1: `git grep -wn 'Deno\|bun' etc/scripts` prints nothing. AC #4: `node --test 'etc/scripts/*.test.ts'` 11/11 pass. tsc reports nothing for etc/scripts except the 2 TS2307 errors in ffi-client.template.ts, which were there before this task. oxlint and oxfmt --check are clean.
- AC #3 is still open: the deno.extra.json files are under pkg/, outside this task's files. The integration agent deletes them (laroux, laroux-bundler, laroux-react, laroux-server, posts; laroux-runtime's is already deleted in the tree), moves the publish.include lists into package.json `files`, and changes the manifest, workflow, .gitignore and doc references to the generator.
The integration agent deleted the deno.extra.json files of laroux, laroux-bundler, laroux-react and laroux-server and moved their publish.include lists into each package.json as `files`, dropping entries that match nothing (LICENSE, which no package directory holds; laroux-bundler's jsr-resolver-plugin.ts; laroux-server's adapters/**/*.tsx) and package.json, which npm always packs. posts/deno.extra.json holds only deno tasks and goes with TASK-214, so AC #3 stays open until then.
<!-- SECTION:NOTES:END -->
