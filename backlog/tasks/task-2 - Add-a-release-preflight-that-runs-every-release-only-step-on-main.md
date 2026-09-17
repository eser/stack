---
id: TASK-2
title: Add a release preflight that runs every release-only step on main
status: Done
assignee: []
created_date: '2026-09-13 16:51'
updated_date: '2026-09-16 15:02'
labels:
  - ci
  - release
dependencies: []
references:
  - .eser/manifest.yml
  - pkg/@eserstack/cli/scripts/npm-build.ts
  - Makefile
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All six release failures on 2026-09-13 (wasip1 build, stale ajan go.mod, external @eserstack/ajan in the npm bundle, JSR self-imports, missing generated manifests in etc/scripts, unexplained gh exit) were detectable before tagging, but the steps that would have caught them only run on tag pushes. A tag must be pushed onto a commit that has already been proven, so the release run never learns anything new.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single command (e.g. deno task cli codebase release preflight) runs locally and in CI on every push to main: builds all three npm bundles, packs the CLI tarball and installs it into a temp consumer outside the repo, runs eser version and eser ajan version there, runs deno publish --dry-run, builds ajan for wasip1 (command and reactor) and as a c-shared library, and runs the Homebrew and Nix scripts in dry-run mode
- [x] #2 The Release Gate job requires the preflight to have passed on the tagged commit
- [x] #3 Preflight wall-clock time is under 10 minutes on the CI runner
- [x] #4 The precommit workflow keeps validate-self-imports and the ajan go.mod tidy check so the cheap failures are caught before push
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the 'preflight' workflow to .eser/manifest.yml (deno task cli preflight): gen-jsr-manifests, deno publish --dry-run, the three npm builders, preflight-npm-consumer.ts (packs the CLI and installs it with npm OUTSIDE the repo, runs --help / version / ajan version and rejects any mention of Deno), ajan native + wasm builds, and the Homebrew and Nix scripts with their new --dry-run modes. build.yml gained a 'Release Preflight' job on every push to main, on tags and on dispatch stage=full; Release Gate now needs [validate, preflight] and accepts them skipped only on a post-publish resume. First CI run (2026-09-16, run 35097793335): the whole job took 89s, of which the preflight workflow itself was 54s — far under the 10-minute budget.
<!-- SECTION:NOTES:END -->
