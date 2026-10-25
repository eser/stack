---
id: decision-30
title: Replacements for the JSR-hosted runtime dependencies
date: '2026-10-15 20:38'
status: accepted
---

## Context

Published npm libraries cannot depend on npm:@jsr aliases without the JSR registry. path, fs, parse-args, hex and dotenv have Node built-in equivalents. toml, jsonc, csv, semver, ulid, tar and yaml do not.

## Options

- Node built-ins plus vetted npm packages (yaml, smol-toml, jsonc-parser, semver and similar) in M2
- Keep the aliases
- Route parsing through Go until M6

## Recommendation

Replace them in M2 with built-ins and vetted npm packages before any packing or publish, per decision std-during-cutover.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-233 (M2-T2), TASK-234 (M2-T3)

Plan key: `std-deps`
