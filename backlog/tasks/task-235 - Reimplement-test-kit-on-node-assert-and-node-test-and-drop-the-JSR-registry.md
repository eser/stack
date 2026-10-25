---
id: TASK-235
title: 'Reimplement test-kit on node:assert and node:test, and drop the JSR registry'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - testing
  - test-kit
  - dependencies
  - std
milestone: m-2
dependencies:
  - TASK-233
  - TASK-234
priority: medium
ordinal: 235000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reimplement @eserstack/test-kit/assert over node:assert/strict, keeping the names and semantics in use: assertThrows and assertRejects return the error, and assertExists and assertInstanceOf narrow. Reimplement ./mock over node:test mock (mock.fn, t.mock.method, callCount). Fix the tests that fail on prototype differences between @std equal and deepStrictEqual. The integration agent removes @std/assert and @std/testing from test-kit and the @jsr line from the root .npmrc and the recipes.

Decisions this task waits on: decision-3 (Where the assertion and mock seam lives); decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-7 (Test runner and assertion library).

Plan key: M2-T4. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No package depends on an @jsr alias, and no .npmrc has an @jsr line
- [ ] #2 `pnpm install --frozen-lockfile` works
- [ ] #3 The test count is unchanged from before the switch, and the gate is green
<!-- AC:END -->
