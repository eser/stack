---
id: decision-69
title: When the persona work starts
date: '2026-10-25 09:47'
status: accepted
---

## Context

Milestones m-0 to m-8 move the repository off Deno, ship `eser` and `noskills` as Go binaries and rebuild laroux. About 1300 files are uncommitted in the working tree. Persona commands written now would be written twice, once in TypeScript and once in Go.

## Options

- Start code after m-3 (`eser` as a Go binary)
- Start code after all of m-0 to m-8
- Start the loader package after m-1

## Decision

No persona code is written until every task of m-0 to m-8 is Done. Until then only documents move: this decision set, ADR 0010, doc-4, milestone m-9, its tasks and a short note in AGENTS.md. README.md, PHILOSOPHY.md and the package READMEs stay as they are.

The first deliverable is `npx eser intro` and the content model. The site comes after it and is generated from the same content.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q5, Q6, Q9, Q20 and Q21).

## Blocks

Every code task of milestone m-9, through TASK-341.
