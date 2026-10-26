---
id: decision-42
title: '@eserstack/di decorator API'
date: '2026-10-15 20:38'
status: accepted
---

## Context

V8 in Node 26 has no decorator syntax. The library file contains no @ syntax; only its tests and consumers use it.

## Options

- Keep the API, call decorators as functions in the tests, and document the transform requirement
- Remove the API

## Recommendation

Keep the API with the documented transform requirement.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-177 (M0-T4)

Plan key: `di-decorators`
