---
id: decision-57
title: laroux browser test driver
date: '2026-10-24 02:30'
status: accepted
---

## Context

laroux R1 needs real-browser tests in Chromium, Firefox and WebKit: the Fetch Metadata values of HTML form posts (spike SA14), islands hydration, CSP, bots and i18n detection (doc-3 section 21). An agent-driven browser, such as a browser extension that an agent controls, is not a test driver: it runs only Chrome, needs a person's browser session, is not available in CI and does not give repeatable results.

## Options

- Playwright (TypeScript, all three engines, needs dependency vetting)
- chromedp from Go (Chromium only)
- Both

## Decision

Playwright. It is vetted under tooling-standards before it is added, as a root devDependency owned by the integration agent. CI installs its browsers in the conformance job (TASK-315); that workflow change goes to the owner for approval like any other. Agents run the same Playwright tests locally and read their traces and screenshots; an agent-driven browser stays a manual debugging aid.

## Decided by

The owner chose Playwright on 2026-10-24 (doc-3 section 25, question 2).

## Blocks

TASK-283 (L-S2), TASK-315 (L6b)

Plan key: `laroux-browser-driver`
