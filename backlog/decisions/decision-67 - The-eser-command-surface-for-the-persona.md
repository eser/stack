---
id: decision-67
title: The eser command surface for the persona
date: '2026-10-25 09:47'
status: accepted
---

## Context

`eser` is a developer CLI today (`kit`, `codebase`, `noskills`, `laroux`, `posts`, `ai`, `cs`). Installed agent hooks call `npx eser@latest noskills` (decision-10), so those names cannot move. The persona needs its own commands, and `npx eser laroux ...` must keep forwarding to the laroux binary.

## Options

- Developer commands stay at the top level and persona commands are added beside them
- Developer commands move under `eser dev ...`
- A separate binary for each

## Decision

Developer commands stay where they are. The persona commands are added at the top level:

- `eser intro` prints who Eser is in a few lines, the content categories (derived from `kind`) and the exact command for each. It goes deeper step by step (`eser intro bio`, `eser intro experience`). `--for <profile>` picks a `kind: profile` record, `--format md|json` picks the output, and without a TTY the output is machine-readable. The JSON output carries a `schemaVersion`.
- `eser <name>` resolves a project by shortcut. When the project record has `cli:`, the call is forwarded to that binary or package, as `eser laroux` is today. Otherwise it prints the project card (description, status, repository, package, domain).
- `eser content ...` holds the content tools: `add <url>`, `stale` and `review`. There is no `revise`, because records are edited in place.
- `eser sync` runs the platform sync.
- A reserved-name list and a validator stop a record shortcut from taking the name of a developer command.

The persona commands are written once, against the Go `eser` binary of milestone m-3, and the TypeScript CLI is not extended for them.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q15, Q16, Q17 and Q31).

## Blocks

TASK-347 and TASK-350.
