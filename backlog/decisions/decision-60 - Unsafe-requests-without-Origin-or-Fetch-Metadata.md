---
id: decision-60
title: Unsafe requests without Origin or Fetch Metadata
date: '2026-10-24 02:30'
status: accepted
---

## Context

laroux's guard (doc-3 section 5) checks Sec-Fetch-Site and Origin on every unsafe request to an action, query POST, JSON or island POST endpoint. Browsers send at least one of them. Requests with neither come from curl, scripts, server-to-server calls, old clients and some proxies that strip headers. Next.js allows such requests and logs a warning.

## Options

- Reject them by default, with a per-action `headerless: "allow"` opt-in
- Allow them with a warning, as Next.js does

## Decision

Reject them by default with 403 FORBIDDEN, and let one action opt in with `headerless: "allow"`. GET queries and GET islands keep allowing headerless requests, because they are side-effect free. The behavior is documented where developers will hit it:
- The laroux README has a section on requests without Origin or Fetch Metadata: which endpoints reject them, the 403 response and its error code, the dev log line, why the default protects against cross-site request forgery, how curl, scripts and server-to-server callers send an Origin header instead, and what `headerless: "allow"` costs.
- In dev, a rejection logs one line naming the action, the missing headers and the opt-in.
- createTestRequest and callAction in /rsc/testing send same-origin headers by default, so tests do not need the opt-in.

## Decided by

The owner chose rejection by default on 2026-10-24 and asked for the behavior to be documented (doc-3 section 25, question 5).

## Blocks

TASK-295 (L4c), TASK-299 (L4g), TASK-306 (L4n)

Plan key: `laroux-headerless`
