---
id: TASK-245
title: 'Create cmd/eser with scripts, plugin forwarding and system commands'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 20:28'
labels:
  - go
  - cli
  - eser
  - distribution
milestone: m-3
dependencies:
  - TASK-242
  - TASK-243
priority: high
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the Go eser on clifx. It provides:
- version, help and completions
- manifest scripts as `eser <script>`
- system install, update, uninstall and doctor
- plugin forwarding, in this order: `eser-<name>` on PATH; then a fixed table of known bins (laroux to `laroux`, noskills to `noskills`, posts to `eser-posts`), looked up on PATH and in a plugin directory passed through ESER_PLUGIN_PATH, which the npm launcher sets; then, if npx exists, `npx --yes <npm package>@<eser version>`; otherwise an install message naming the npm command
Update downloads `${command}-v${ver}-${triple}` from GitHub Releases using the Rust triples in one Go table that matches targets.ts releaseTriple. It verifies the archive against SHA256SUMS.txt and fails closed with an npm pointer when the archive is missing, then renames the new binary over itself.

Decisions this task waits on: decision-10 (How existing `npx eser@latest noskills` hooks keep working); decision-38 (Release archive names).

Plan key: M3-T4. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update tests against a local HTTP fixture cover a valid archive, a checksum mismatch and a missing archive, using a v4.5.2-named archive
- [x] #2 Forwarding tests cover each resolution step with fake bins, including the ESER_PLUGIN_PATH and npx fallbacks
- [x] #3 `eser laroux --help` and `eser noskills --help` reach the Node CLIs in the workspace; `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. New cmd/eser (Go, on clifx and the TASK-243 manifest loader; README). Dispatch: built-in commands and help through clifx (version, install, update, uninstall, doctor, help, completion bash|zsh|fish with the __complete callback; --version; --json), then a manifest script, then plugin forwarding, the order of the TS CLI. Scripts are listed in help and completions and run before clifx so their arguments reach them untouched: depends first in post-order with cycle and missing-name errors, workingDirectory, 'sh -c' with the forwarded words as positional parameters ending in "$@", and a leading 'eser' replaced by this binary, as scripts.ts does. Forwarding: eser-<name> on PATH; then the fixed table laroux->laroux, noskills->noskills, posts->eser-posts on PATH and in each ESER_PLUGIN_PATH directory; then 'npx --yes <package>@<eser version>' (no version for a dev build) when npx exists (posts has no npm package); otherwise a message naming 'npm install -g <package>@<version>'; path-like names are refused; the plugin's exit code is returned. Update: latest version from the releases API, archive eser-v<ver>-<triple>.tar.gz/.zip from one Go table of Rust triples (TestReleaseTriplesMatchTargetsTS keeps it equal to targets.ts, reading releaseTriple or the current denoTarget field), SHA256SUMS.txt verification that fails closed (unreachable, unlisted, mismatch), extraction with archive/tar+gzip and archive/zip (no external tar), write <exe>.new and rename over the running binary (Windows leaves eser.new.exe with a note); a 404 archive ends with the npm pointer. Install copies to ~/.local/bin or /usr/local/bin with a completion hint; uninstall removes that copy; doctor reports version, platform and triple, binary, PATH, git/node/pnpm/go versions, manifest and git hooks. Tests: TestSelfUpdate against an httptest release named v4.5.2 (a valid archive replaces the binary, a checksum mismatch and a missing SHA256SUMS.txt refuse and leave it, a missing archive gives the npm pointer, an up-to-date binary does nothing), TestArchiveName, TestNewerThan; TestResolvePlugin with fake bins (eser-<name>, eser-<name> before the known bin, the known bin on PATH, in ESER_PLUGIN_PATH and in its later entry, npx with and without a version, no npx, posts, unknown, path-like) and TestForwardRunsThePlugin; TestScriptRunOrder, TestShellArgsAndResolveCommand, TestRunScript (real sh: forwarded words, depends with $ headers, workingDirectory, exit code passthrough), TestBuiltinsAndHelp (a broken manifest fails script dispatch but not help); TestForwardReachesTheWorkspaceCLIs runs 'eser laroux --help' and 'eser noskills --help' through ESER_PLUGIN_PATH shims into pkg/@eserstack/laroux-server/cli.ts and noskills/main.ts under node and checks their help text (both pass under Node 26). make build now also builds bin/eser with -X main.version from VERSION. golangci-lint 0 issues; make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
