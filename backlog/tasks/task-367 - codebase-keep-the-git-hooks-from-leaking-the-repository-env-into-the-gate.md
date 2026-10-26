---
id: TASK-367
title: 'codebase: keep the git hooks from leaking the repository env into the gate'
status: Done
assignee: []
created_date: '2026-10-26 12:30'
labels:
  - codebase
  - bug
dependencies: []
priority: high
ordinal: 370000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while a hooked commit ran in a linked worktree. git exports GIT_DIR and GIT_INDEX_FILE, among other repository variables, to a hook in a linked worktree. The managed hooks ran the precommit workflow with them set, and the gate's tests that create scratch repositories inherited them, so their `git init`, `commit`, `config` and `tag` calls acted on the repository being committed to: the worktree's branch got ten fixture commits and its index a fixture index, two fixture tags were created, and the shared `.git/config` got `core.bare = true`, a `core.hooksPath` into a temporary directory and a `[user]` section of the test identity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The hooks the Go and the TypeScript `eser codebase install` write unset git's repository variables before they run the workflows, with a test each that runs a hook script with those variables set
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: `cmd/eser/codebase_hooks.go` `hookScript` and `pkg/@eserstack/codebase/install.ts` `generateHookScript` wrote the workflow command as the hook's only line, so every variable git exports to a hook reached the gate and the subprocesses of its tests. Tests such as `TestCodebaseInstallInATemporaryRepository` (`cmd/eser/codebase_hooks_test.go`) run git with only `cmd.Dir` set, which GIT_DIR overrides.

Fix: both writers put `unset $(git rev-parse --local-env-vars)` before the command. git lists the variables itself, so the list follows the installed git version, and it lists them even when GIT_DIR names a directory that does not exist. The hook runs from the working tree root, where git finds the repository without them. Tests: `TestHookScriptClearsTheRepositoryEnv` (Go) and `generateHookScript clears the repository variables git exports to hooks` (TS) both failed before the fix. Installed hooks pick the fix up on the next `eser codebase install`.

The repository state the leak wrote was repaired by hand: `.git/config` restored, the two fixture tags deleted, and the worktree's branch moved back to its base with its working tree left as it was.
<!-- SECTION:NOTES:END -->
