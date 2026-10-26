---
id: decision-38
title: Release archive names
date: '2026-10-15 20:38'
status: accepted
---

## Context

Installed v4.5.x binaries self-update by `<name>-v<ver>-<rust-triple>`, and install.sh, Homebrew and Nix use the same names.

## Options

- Keep the Rust triples permanently
- Switch to GOOS_GOARCH names
- Publish both

## Recommendation

Keep the Rust triples permanently, including for the forwarding stubs. targets.ts renames the field to releaseTriple, and preflight tests self-update from v4.5.2-named archives.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-202 (M1-T8), TASK-245 (M3-T4), TASK-251 (M3-T10), TASK-253 (M3-T14), TASK-261 (M4-T6)

Plan key: `archive-naming`
