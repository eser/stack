---
id: decision-48
title: Vite and webpack in laroux apps
date: '2026-10-23 21:05'
status: accepted
---

## Context

doc-2 aimed for a tree with no vite or webpack package, enforced by a lockfile gate. That aim was the only reason to vendor the react-server-dom-webpack runtime builds (its webpack peer is required) and @vitejs/plugin-rsc's transforms (its vite peer). Vendored copies miss React security patches unless a scheduled check refreshes them.

## Options

- Strict: no vite or webpack in node_modules, a lockfile gate, and vendored Flight runtime and transforms
- Optional: laroux builds and runs without Vite, Vite may sit next to it in an app, and nothing checks for either package

## Decision

Optional. laroux never needs Vite or webpack, and an app may still have Vite installed beside it (for example for Vitest). No gate checks whether vite or webpack is installed. The Flight runtime and the RSC transforms become plain dependencies by default, so React patches arrive through the package manager. S1 confirms that the fully bundled server graphs still work with them, and vendoring is used only if it does not.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3). Removes the lockfile-forbid validator and the vendor freshness check from the plan.

Plan key: `laroux-vite-optional`
