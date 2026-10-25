---
id: decision-11
title: 'When install.sh and install.ps1 stop offering eser, noskills and laroux'
date: '2026-10-15 20:38'
status: accepted
---

## Context

install.sh is served from main (README.md:134, :151) and reads releases/latest (install.sh:70). A static refusal would break `curl | sh` the moment the cutover merges, while v4.5.2 still has the archives.

## Options

- Decide from the release: install whatever archive the release has, print the npm command on 404, and refuse laroux only for tags at or above the first npm-only version
- Change install.sh only in the release commit
- Refuse statically at the cutover merge

## Recommendation

Decide from the release. It is safe at merge time, needs no coordination with the release commit, and behaves correctly for every past and future tag.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-226 (M1-T32), TASK-241 (M2-T9)

Plan key: `install-script-fallback`
