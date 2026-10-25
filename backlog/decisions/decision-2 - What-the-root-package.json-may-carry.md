---
id: decision-2
title: What the root package.json may carry
date: '2026-10-15 20:38'
status: accepted
---

## Context

Root node_modules holds only @types, and the root package.json has only @types/node. etc/scripts tests, etc/codemods and .agents scripts cannot resolve workspace packages or tools, so several tasks fail as written without root devDependencies.

## Options

- An explicit allow list: the toolchain (typescript, oxlint, oxlint-tsgolint, oxfmt, mitata, @types/node), oxc-parser while the codemods exist, and @eserstack/test-kit as workspace:*; anything else needs owner approval
- Move root-level scripts into a private workspace package such as etc/ with its own package.json
- Keep the root empty and run every root script from inside a package

## Recommendation

The explicit allow list, recorded in the ADR 0005 appendix and enforced by review. Checks that need other workspace packages run from inside a package that declares them.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-185 (M0-T20), TASK-187 (M0-T12), TASK-186 (M0-T17), TASK-192 (M0-T18), TASK-193 (M0-T19), TASK-195 (M1-T1)

Plan key: `root-devdeps`
