---
id: decision-54
title: Scope of the first laroux release
date: '2026-10-23 23:10'
status: accepted
---

## Context

The laroux-actions-islands design split its work into a first release (R1) and phase 2. Several features that Astro 7.4, TanStack Start or Next.js 16.4 already have were left for later or for separate designs.

## Options

- R1 as the design proposed, with partial prerendering, sessions, i18n routing and composable fetch handlers later
- R1 with all of them

## Decision

R1 includes, in addition to the designed server functions and islands:
- cacheable server islands (`<Defer>` fetch mode)
- partial prerendering (`prerender: 'partial'`)
- a typed env split that never inlines server-only values into client chunks
- one `onRequestError` hook for pages, route handlers, actions and islands
- built-in sessions with drivers for Node and Cloudflare Workers
- i18n routing
- composable fetch handlers, so an app can put its own code in front of actions, pages and islands

Sessions, i18n routing and composable handlers each get their own section in the design document before tasks are written.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3).

Plan key: `laroux-r1-scope`
