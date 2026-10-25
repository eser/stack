---
id: decision-6
title: Give JSR consumers a signal before freezing it
date: '2026-10-15 20:38'
status: accepted
---

## Context

Without a signal, jsr.io consumers and `deno install jsr:@eserstack/cli` users stay on 4.5.x with no notice. Any new JSR content needs a publish, and a publish needs Deno, which exists only until M1 starts.

## Options

- A last Deno-era release, 4.5.3, prepared in M0-T21 and released by the owner before M1: README notices, an updater that fails with an npm pointer, and a notice in JSR-installed eser
- The owner edits package descriptions on jsr.io by hand, with no publish
- No signal

## Recommendation

The 4.5.3 release from M0-T21. It costs one release while Deno still works, and it also gives binaries that update to 4.5.3 a readable updater.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-194 (M0-T21), TASK-195 (M1-T1)

Plan key: `jsr-deprecation-notice`
