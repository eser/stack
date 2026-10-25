---
id: decision-13
title: When the first release after the cutover happens
date: '2026-10-15 20:38'
status: accepted
---

## Context

The release is ready at the end of M2. The Go eser binary (M3-T11) can be close, because its tasks run in parallel with M1 and M2, and it now also needs the eser-posts bin (M3-T13) and the forwarding stubs (M3-T14). The Go noskills binary comes later (M4).

## Options

- Hold the first release until M3-T11, which ships the Go eser binary, the launcher with npx noskills compatibility and the laroux and noskills stubs
- Release right after M2 with eser, noskills and laroux on npm only; the channels skip the missing archives
- Hold until M4-T6 also ships noskills

## Recommendation

Hold until M3-T11, so binary users never lose self-update and existing npx hooks keep working from day one.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-241 (M2-T9), TASK-254 (M3-T11)

Plan key: `first-release-timing`
