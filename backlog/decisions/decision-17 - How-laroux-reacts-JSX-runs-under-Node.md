---
id: decision-17
title: How laroux-react's JSX runs under Node
date: '2026-10-15 20:38'
status: accepted
---

## Context

Node does not load .tsx. There are 9 .tsx files: 3 contain no JSX, and 6 in laroux-react contain about 46 JSX roots. link, image and span-renderer are imported server-side for SSR. module.register is runtime-deprecated in Node 26.

## Options

- Rewrite the 6 files with React.createElement in .ts
- Keep JSX and emit laroux-react before use, also in the workspace
- A module.registerHooks JSX loader

## Recommendation

Rewrite with React.createElement in M0. The change is bounded, and the whole workspace then runs on plain node.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-179 (M0-T6)

Plan key: `jsx-approach`
