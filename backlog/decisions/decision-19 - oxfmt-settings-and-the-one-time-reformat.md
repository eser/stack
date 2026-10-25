---
id: decision-19
title: oxfmt settings and the one-time reformat
date: '2026-10-15 20:38'
status: accepted
---

## Context

deno fmt is dprint-based; oxfmt is Prettier-compatible, still 0.x, and defaults to printWidth 100 and trailingComma all. Expect a diff across most of about 1,650 files, especially Markdown.

## Options

- One reformat commit with printWidth 80, sortPackageJson off and an exact version pin, listed in .git-blame-ignore-revs
- oxfmt for code only, with Markdown excluded
- oxfmt defaults

## Recommendation

One reformat commit as the first change of M1 (M1-T2), with printWidth 80, sortPackageJson off and an exact version pin. If the M0-T2 spike shows bad Markdown output, exclude Markdown and record a follow-up.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-195 (M1-T1), TASK-196 (M1-T2)

Plan key: `formatter-settings`
