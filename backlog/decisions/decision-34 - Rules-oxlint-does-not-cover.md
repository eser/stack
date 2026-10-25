---
id: decision-34
title: Rules oxlint does not cover
date: '2026-10-15 20:38'
status: accepted
---

## Context

oxlint has no camelcase rule and no tag-requiring ban-untagged-todo rule. JS plugins are alpha.

## Options

- A Go codebasefx validator added in M0 on a comment-aware lexer
- oxlint JS plugins
- Drop the rules

## Recommendation

The Go validator in M0-T16, so enforcement never lapses. Delete the Deno lint plugin.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-191 (M0-T16), TASK-195 (M1-T1)

Plan key: `lint-gaps`
