---
id: decision-21
title: Required TODO tag form and what the validator reads
date: '2026-10-15 20:38'
status: accepted
---

## Context

deno lint's ban-untagged-todo accepts any TODO(<tag>) or TODO @user in comments only. workflow-practices asks for TODO(TASK-n). No source file carries a TODO tag today, and task-48 already replaced the TODO(TASK-NEW) placeholders. noskills/context/compiler.ts:826, :968, :2509 and :2783 contain 'TODO' inside prompt strings.

## Options

- TODO(TASK-<number>) in comments only, with string and template literals masked
- Any TODO(<tag>) in comments only, matching deno lint today

## Recommendation

TODO(TASK-<number>) in comments only, with literals masked. It matches workflow-practices and passes on the current tree.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-191 (M0-T16), TASK-229 (M1-T35)

Plan key: `todo-tag-form`
