---
id: TASK-368
title: 'release: keep the noskills platform binaries executable when pnpm packs them'
status: Done
assignee: []
created_date: '2026-10-27 09:00'
updated_date: '2026-10-27 18:00'
labels:
  - release
  - noskills
  - bug
  - owner-input
dependencies: []
priority: high
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-252: `pnpm pack` writes the staged noskills binary of a `noskills-<platform>` package at mode 0644, while `npm pack` keeps 0755. With a pnpm-packed platform tarball, `eser noskills --help` failed with EACCES. The publish job in .github/workflows/build.yml publishes these platform packages with `pnpm publish`, so a published binary may not be executable unless the launcher sets the mode before it runs it. etc/scripts/preflight-noskills-launcher.ts and the TASK-252 plugin-bins check pack the platform package with npm, so preflight does not catch it. No noskills-<platform> package is on npm yet (TASK-236 bootstrap list), so no broken binary has shipped; fix it before the first publish, in the publish job (pack with npm, or set the mode before `pnpm publish`) or in the launcher; either is a release or workflow change for the owner to approve.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The binary inside every packed noskills-<platform> tarball has an executable mode, checked by a preflight step that packs the way the publish job does
- [x] #2 A packed platform package run through the launcher answers `--help` with no EACCES
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decisions 2026-10-27: fix it in the launcher and leave the workflows as they are, so the publish job keeps `pnpm publish`; then also list the binary in each platform package's `publishConfig.executableFiles`, so the tarball itself holds it with the execute bits.

Root cause: pnpm pack writes every file that is not a `bin` (or listed in `publishConfig.executableFiles`) at mode 0644, whatever its mode on disk, and the platform packages list the binary in `files` only. npm installs the tarball's mode, and pkg/@eserstack/noskills/scripts/npm-launcher.ts spawned the binary as found, so the spawn failed with EACCES.

Launcher: `ensureExecutable` runs before the spawn. On a platform other than Windows, a binary the current user cannot execute (`fs.accessSync` with X_OK) gets the execute bits 0111 added to its mode, the bits npm pack keeps. When chmod fails (a read-only install, or one another user owns), the launcher exits 1 with a message that names the binary and the `chmod +x <binary>` command, instead of a raw EACCES. Tests: four `ensureExecutable` cases with an injected mode access, and one end-to-end test that runs the launcher under node next to a fixture node_modules whose platform binaries are shell scripts at 0644; before the fix it failed with `spawn ... EACCES`.

The Go eser needs no change: cmd/eser/forward.go runs the `noskills` bin on PATH or in ESER_PLUGIN_PATH, which is the npm launcher, and never the platform binary in node_modules.

Preflight: etc/scripts/preflight-noskills-launcher.ts now packs the launcher bundle and the host's platform package with pnpm pack, as the publish job's `pnpm publish` does, prints the binary's mode in the tarball, runs `npx noskills --help` first and fails on EACCES, and checks that the installed binary has the execute bits after that run. With the launcher's fix disabled in dist/noskills.js the step fails. etc/scripts/preflight-plugin-bins.ts still packs the platform package with npm (mode 0755), so both modes are covered. The tar header reader `tarEntryMode` and `formatMode` have unit tests in etc/scripts/preflight-noskills-launcher.test.ts.

Tarball mode: each noskills-<platform> package.json lists its binary in `publishConfig.executableFiles` (`./noskills`, `./noskills.exe` on win32), so pnpm packs it at 0755 even from a 0644 file; checked with a fixture package at 0644. The preflight now fails unless the pnpm-packed tarball holds the binary with the execute bits 0111 (skipped on Windows), and the launcher's fix stays as the fallback for an install that loses the bits.

No CHANGELOG entry: no published noskills-<platform> package ever had a non-executable binary, and users change nothing.
<!-- SECTION:NOTES:END -->
