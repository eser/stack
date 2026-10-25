---
id: TASK-226
title: >-
  CI release jobs and install channels that decide from the release, not the
  merge
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - ci
  - release
  - distribution
milestone: m-1
dependencies:
  - TASK-205
  - TASK-224
  - TASK-225
priority: high
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In build.yml:
- The publish job drops gen-jsr-manifests, `deno publish` and the jsr.io summary links per decision jsr-publishing, and keeps npm bundle publishing.
- build-ajan-darwin and compile-binaries build with make and node and produce Go binaries only, per decision binaries.
- update-homebrew and update-nix-hashes run the node scripts and update only the formulas and hashes whose archives are present in the release being built, so nothing changes before a release.
- Fix the release-gate message at :287.
publish-ajan.yml uses make.
install.sh and install.ps1 are served from main and read releases/latest (install.sh:70), so per decision install-script-fallback they never refuse statically:
- For eser and noskills, they install the archive if the release has it and print the npm install command and exit non-zero if it returns 404.
- For laroux, they print `npm i -g laroux` only when the tag is at or above the first npm-only version (one variable, set from decision release-version).
- flake.nix keeps the eser, noskills and laroux packages on their last released hashes until a release provides new archives.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-8 (What replaces deno compile for the eser, noskills and laroux binaries); decision-11 (When install.sh and install.ps1 stop offering eser, noskills and laroux); decision-29 (Version of the first release after the cutover).

Plan key: M1-T32. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `grep -rni 'deno\|setup-bun' .github/workflows` returns nothing; actionlint passes
- [ ] #2 A workflow_dispatch dry run of the build stages succeeds without publishing
- [ ] #3 Against v4.5.2, `install.sh -s eser`, `-s noskills`, `-s laroux` and `-s noskills-server` and install.ps1 still install
- [ ] #4 Against a local fixture release with no eser archive, install.sh prints the npm instruction and exits non-zero; a fixture tag at the gate version prints the laroux npm instruction
- [ ] #5 `nix flake check` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24; grep):
- build.yml: publish (:720) :780 gen-jsr-manifests and :783 `deno publish`; the release-gate message :287 'deno task cli codebase release ...'; build-ajan-darwin (:927) :981 and :984 `deno run .../ajan/scripts/build.ts`; compile-binaries (:995) :1068-1081 (ajan scripts/build.ts, npm/generate-packages.ts, cli/scripts/compile.ts); update-homebrew (:1289), update-nix-hashes (:1335).
- pkg/@eserstack/ajan/scripts/build.ts and package.ts and npm/generate-packages.ts are deleted in the working tree (TASK-188 moved them to Makefile targets); build.yml and publish-ajan.yml still call them until the TASK-188 CI patch is applied.
- publish-ajan.yml: setup-deno at :68-71 and :129-132; `deno run .../ajan/scripts/build.ts` at :100, :103 and :177-182; generate-packages at :185.
- etc/scripts/install.sh:70 and install.ps1:92 read releases/latest with no 404 fallback and no npm pointer (0 Deno mentions).
- flake.nix:19 reads ./VERSION, so the hashes point at an unreleased version at bump time; lines 113 and 116 put deno and bun in the dev shell.
<!-- SECTION:NOTES:END -->
