---
id: decision-59
title: React and rsdw version range
date: '2026-10-24 02:30'
status: accepted
---

## Context

@eserstack/laroux depends on react-server-dom-webpack (rsdw) and has react and react-dom as peers (decision-48, doc-3 section 2). rsdw must run with the exact react and react-dom version it was built for. On 2026-10-24 react, react-dom and rsdw are all at 19.3.1 on npm, and @vitejs/plugin-rsc is at 0.5.38.

## Options

- A tilde range on rsdw, with a startup same-version check and a CI canary on each React patch
- An exact pin, which needs a laroux release for every React patch

## Decision

A tilde range that starts at the newest stable release and keeps up with React:
- rsdw and @vitejs/plugin-rsc use a tilde range on the newest stable version when the task that adds them starts (~19.3.1 and ~0.5.38 today); the react and react-dom peers start at the same version.
- Every laroux release requires the newest React minor that passes the React contract suite (doc-3 section 21). A new React minor gets a bump task the week it ships, and the floor moves to it once the suite passes; laroux never supports a React minor older than the one before the newest.
- A startup check refuses to run when react, react-dom and rsdw report different versions.
- A scheduled CI job runs the contract suite and the conformance fixtures against react@latest and react@canary. A failure on latest is a bug; a failure on canary is an early warning.
- The recipes (TASK-316) pin the newest versions.

## Decided by

The owner chose the tilde range on 2026-10-24 and asked that laroux stay close to the current React release (doc-3 section 25, question 4).

## Blocks

TASK-282 (L-S1), TASK-293 (L4a), TASK-315 (L6b), TASK-316 (L7)

Plan key: `laroux-react-range`
