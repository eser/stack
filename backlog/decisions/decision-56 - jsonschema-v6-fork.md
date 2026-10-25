---
id: decision-56
title: jsonschema/v6 fork
date: '2026-10-24 00:20'
status: accepted
---

## Context

github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 compiles the Draft 4, 6, 7, 2019-09 and 2020-12 metaschemas in a package init() (draft.go). Every process that links workflowfx pays it: 5.3 ms of the 8-9 ms command-mode init in WASM, and 1.3 ms of the 2.8 ms native load. The WASM profile avoids it by cutting the codebasefx -> workflowfx edge (TASK-272), but the native library still pays it.

## Options

- Send an upstream PR that makes the metaschema compile lazy
- Carry a fork with a sync.Once-guarded lazy compile, wired through `replace` directives
- Defer workflowfx validation so the package is not linked by default

## Decision

A fork, without an upstream PR (TASK-275). The fork is an in-tree copy under `third-party/jsonschema/` at the repo root, wired by a `replace` directive in both go.mod files, and documented where agents look: a FORK.md in the fork, a comment above each `replace` line, and an entry in docs/agents/languages-and-security.md.

## Decided by

The owner chose a fork with no upstream PR on 2026-10-24, and asked for a note that agents will find. The in-tree location is the planner's default.

## Blocks

TASK-275 (M0-T25)

Plan key: `jsonschema-fork`
