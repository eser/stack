---
id: decision-43
title: Replacement for deno doc --html and --lint
date: '2026-10-15 20:38'
status: accepted
---

## Context

docs/api is generated and gitignored. JSDoc presence is already checked by the Go validate-docs.

## Options

- Drop HTML generation and point docs-lint at validate-docs
- TypeDoc

## Recommendation

Drop the HTML generation.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-200 (M1-T6)

Plan key: `docs-api`
