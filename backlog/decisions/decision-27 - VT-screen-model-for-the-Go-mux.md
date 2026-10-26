---
id: decision-27
title: VT screen model for the Go mux
date: '2026-10-15 20:38'
status: accepted
---

## Context

The TS mux uses @xterm/headless, and go.mod has no VT emulator.

## Options

- A vetted Go VT emulator dependency
- An in-house VT parser in shellfx
- Keep the TS worker on Node permanently

## Recommendation

Vet a Go dependency in M5-T1, and build in-house only if none passes vetting.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-263 (M5-T1)

Plan key: `vt-emulator`
