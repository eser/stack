---
id: TASK-376
title: 'release: do not show a release without archives as latest'
status: To Do
assignee: []
created_date: '2026-11-07 16:30'
labels:
  - release
  - ci
milestone: m-2
dependencies: []
priority: medium
ordinal: 379000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This needs the owner's approval because it changes a workflow (.github/workflows/build.yml; workflow-practices: ask first before workflow changes). Nothing here has been changed.

Confirmed by reading .github/workflows/build.yml at 4665f99e. `upload-assets` needs `release-notes`, and `release-notes` creates the published GitHub release:

```yaml
# build.yml:894-896
release-notes:
  name: Sync Release Notes
  needs: [release-gate, publish]
# build.yml:961, no --draft and no --latest=false
elif gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --title "eserstack $TAG" --notes-file "$NOTES"; then
# build.yml:1228-1230
upload-assets:
  name: Upload & Sign Assets
  needs: [compile-binaries, release-notes]
# build.yml:1285, inside the per-file retry loop of :1281
if timeout 180 gh release upload "$TAG" --clobber "$asset"; then
```

So from build.yml:961 until `upload-assets` finishes (signing, then uploads, `timeout-minutes: 30` at :1243), `releases/latest` is the new version with no archives. What a client gets in that window:

- etc/scripts/install.sh:83 resolves the tag from `releases/latest`. The archive answers 404, and :107-111 turn that into the npm command and exit 1 for eser and noskills (`use_npm`, :178-183), and into `error "${TAG} has no ${ARCHIVE}"` for noskills-server (:109). `TestInstallShDecidesFromTheRelease` (cmd/noskills/install_dry_run_test.go:284) pins that decision.
- While the loop at build.yml:1281 runs, archives upload before `SHA256SUMS.txt`, so a client whose archive is already there fails at install.sh:113-114 with "Failed to download checksums".
- If `upload-assets` fails, the state lasts until someone resumes the run with `stage=post-publish`.
- The same URL is read by etc/scripts/install.ps1:103, cmd/eser/update.go:63, pkg/@eserstack/codebase/cli-system/handlers/version-check.ts:37 and pkg/ajan/noskillsserverfx/update_check.go:15. How each behaves in the window was not traced.

Options. None has been run. The gh flags are from `gh release create --help` and `gh release edit --help`; the behaviour of GitHub and gh on drafts needs a check in a test repository.

1. Create the release as non-latest, mark it latest after the upload: `gh release create ... --latest=false` at build.yml:961, and `gh release edit "$TAG" --latest` as the last step of `upload-assets`.
   - For: the smallest change. `releases/latest` stays on the previous release until the new one is complete. Public download URLs keep working, so `update-homebrew` and `update-nix-hashes` (build.yml:1312, :1358) need no change. The resume path is unaffected, since `gh release edit` at :959 and :964 does not touch the flag.
   - Against: the release page is public during the window, and `ESER_INSTALL_VERSION=<new version>` still sees a release without archives. The release list shows it without the Latest badge for that time. A failed upload leaves the previous release as latest, which is the wanted result.
2. Create a draft, publish after the upload: `--draft` at :961 and `gh release edit "$TAG" --draft=false --latest` as the last step of `upload-assets`.
   - For: no public half state at all, for `releases/latest` and for tagged URLs alike.
   - Against: more moving parts. `DownloadSHA256Sums` reads the public download URL (pkg/ajan/codebasefx/release_distribution.go:259-262), so publishing has to come before `update-homebrew` and `update-nix-hashes`. `gh release view` and `edit` at :958-964 and `gh release upload` at :1285 have to find a draft by tag, on a first run and on a resume, and a resume of a release already published must not turn it back into a draft. pkg/ajan/codebasefx/release.go:354-371 (the release notes of `eser codebase`) carries the same create-or-edit logic and would have to agree.
3. Reorder: `upload-assets` runs first and creates the release with its files (`gh release create "$TAG" binaries/*`), and `release-notes` then edits the notes.
   - For: the release appears with its assets, and the job order reads the way the state should change. Whether gh keeps the release unpublished until the last file is up needs confirming.
   - Against: it gives up the per-file retry at :1281-1296, added because "a single stalled multi-file upload hung for nine minutes" (the comment above the `run:` at :1277). `upload-assets` would have to take over the guard that a failed `publish` blocks a release (:897-902), and the title and notes creation would split across two jobs.
4. Leave the workflow, teach the clients: install.sh and install.ps1 fall back to the previous release when the latest has no archive.
   - For: no workflow change, and the scripts are served from main, so they apply at once.
   - Against: it works against decision-11, where the scripts decide from the release they resolve, and against what `TestInstallShDecidesFromTheRelease` pins. It adds a release-list walk to two scripts and leaves `eser update` and the version checks, which are in shipped binaries, as they are.
5. Do nothing: accept the window and resume by hand after a failed upload.
   - For: no change or risk just before 5.0.0.
   - Against: every release run sends some installs to npm or to an error, and a failed `upload-assets` makes it last.

Recommendation: option 1, unless the owner also wants tagged URLs clean during the window, in which case option 2. The owner decides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner has chosen an option and approved the workflow change
- [ ] #2 During a release run, `releases/latest` does not name a release without its archives and SHA256SUMS.txt
- [ ] #3 A resume with `stage=post-publish` still works, for a release that has archives and for one that does not
- [ ] #4 `update-homebrew` and `update-nix-hashes` still find the archives and SHA256SUMS.txt
<!-- AC:END -->
