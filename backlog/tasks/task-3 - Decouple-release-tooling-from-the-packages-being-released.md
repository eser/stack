---
id: TASK-3
title: Decouple release tooling from the packages being released
status: Done
assignee: []
created_date: '2026-09-13 16:51'
updated_date: '2026-09-13 18:10'
labels:
  - ci
  - release
dependencies: []
references:
  - etc/scripts/update-homebrew-formula.ts
  - etc/scripts/update-nix-hashes.ts
  - etc/scripts/gen-jsr-manifests.ts
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
release-notes, update-homebrew-formula and update-nix-hashes import @eserstack/standards and @eserstack/shell from the workspace. A broken or unresolvable package therefore breaks the tool that publishes it: on 2026-09-13 the Homebrew and Nix jobs failed with 'Import @eserstack/standards/cross-runtime not a dependency' because etc/scripts resolves bare specifiers only through the gitignored generated manifests. gen-jsr-manifests already follows the right rule: a bootstrap step must not depend on what it bootstraps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 etc/scripts/update-homebrew-formula.ts and update-nix-hashes.ts have no bare @eserstack/* imports and run from a fresh checkout without generated manifests
- [x] #2 The release-notes sync either has no workspace imports or runs from the previously published CLI release, so a broken workspace package cannot block creating the GitHub Release
- [x] #3 validate-runtime-js-apis excludes etc/scripts release tooling explicitly with a comment stating why
- [x] #4 The Generate JSR manifests steps added to the Homebrew and Nix jobs on 2026-09-13 are removed again because they are no longer needed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
update-homebrew-formula.ts and update-nix-hashes.ts now use Deno APIs directly (Deno.Command, Deno.readTextFile, ...) and import only ./dist-utils.ts and jsr:@std/path; verified they type-check with the generated manifests removed. Both are listed in validate-runtime-js-apis excludes with a comment. The Homebrew and Nix jobs dropped pnpm install, the Deno cache and the manifest generation step. The release-notes job no longer uses the workspace at all: it installs eser@VERSION from npm into a scratch dir (retry loop for registry lag) and runs 'eser codebase gh release-notes' from that bundle; verified locally under Node with no FFI and with a mismatched old platform package that the bundle still drives gh and surfaces its stderr.
<!-- SECTION:NOTES:END -->
