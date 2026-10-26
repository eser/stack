---
id: decision-32
title: Home of the validators that inspect TypeScript source
date: '2026-10-15 20:38'
status: accepted
---

## Context

code-conventions, self-imports, error-coverage and server-loc parse TS, and oxlint JS plugins are alpha. The other validators already live in Go, and M0-T16 adds a shared TS lexer to codebasefx.

## Options

- Port them to Go codebasefx on the shared lexer
- oxlint JS plugins
- Keep them in TS run by node

## Recommendation

Port them to Go (M3-T5, M3-T6) on the M0-T16 lexer, and revisit oxlint plugins when they leave alpha.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-246 (M3-T5), TASK-247 (M3-T6)

Plan key: `ast-validators`
