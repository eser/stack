---
id: decision-3
title: Where the assertion and mock seam lives
date: '2026-10-15 20:38'
status: accepted
---

## Context

@eserstack/testing depends on @eserstack/standards, standards depends on primitives, and the Go circular-deps check counts devDependencies (workspace_validators.go:45). A seam inside @eserstack/testing would create the cycles standards->testing->standards and primitives->testing->standards->primitives, which turns the Deno gate red in M0.

## Options

- A new private leaf package @eserstack/test-kit with no workspace dependencies, not published
- Move standards' and primitives' tests to direct @std imports and keep the seam in @eserstack/testing
- A non-package helper directory imported by relative path

## Recommendation

The private leaf package @eserstack/test-kit. It has no cycle, one place to change in M2-T4, and nothing to publish. The package count goes from 47 to 48.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-186 (M0-T17), TASK-223 (M1-T29), TASK-235 (M2-T4)

Plan key: `seam-location`
