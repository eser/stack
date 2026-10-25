---
id: decision-35
title: Parser for the codemods
date: '2026-10-15 20:38'
status: accepted
---

## Context

rolldown ships an oxc parser, but rolldown is a dependency of @eserstack/bundler and cannot be resolved from etc/codemods at the root.

## Options

- oxc-parser as an exactly pinned root devDependency, removed in M1-T37
- Resolve rolldown's parser through a path into pkg/@eserstack/bundler/node_modules
- Run the codemods from inside the bundler package

## Recommendation

oxc-parser as a root devDependency under the root-devdeps policy.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-185 (M0-T20), TASK-192 (M0-T18), TASK-193 (M0-T19)

Plan key: `codemod-parser`
