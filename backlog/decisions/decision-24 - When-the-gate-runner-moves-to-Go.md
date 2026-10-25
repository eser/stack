---
id: decision-24
title: When the gate runner moves to Go
date: '2026-10-15 20:38'
status: accepted
---

## Context

Moving the runner to Go before the cutover would put large Go work (workflowfx parity, validator ports) on the critical path. Moving it after M1 keeps the cutover fast. The M0-T13 CI smoke test reduces the risk of running the TS CLI on Node.

## Options

- The TS CLI on Node runs the gate during M1, and the Go eser takes over in M3-T7
- The Go eser takes over before the cutover

## Recommendation

The TS CLI on Node runs the gate during M1, after M0-T13 proves it in CI. The Go runner takes over in M3-T7, built in parallel.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-199 (M1-T5), TASK-248 (M3-T7)

Plan key: `gate-runner`
