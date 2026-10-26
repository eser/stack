---
id: TASK-235
title: 'Reimplement test-kit on node:assert and node:test, and drop the JSR registry'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 12:00'
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
- [x] #1 No package depends on an @jsr alias, and no .npmrc has an @jsr line
- [x] #2 `pnpm install --frozen-lockfile` works
- [x] #3 The test count is unchanged from before the switch, and the gate is green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Baseline before the switch (root `pnpm test`): tests 6102, suites 744, pass 6102, fail 0, cancelled 0, skipped 0, todo 0. After the switch: tests 6102, suites 744, pass 6102, fail 0, cancelled 0, skipped 0, todo 0. The test-kit tests gained assertions inside their existing cases, not new cases, so the count stays the same.

test-kit/assert keeps every name the tests use (assert, assertArrayIncludes, assertEquals, assertExists, assertFalse, assertGreater, assertInstanceOf, AssertionError, assertLess, assertMatch, assertNotEquals, assertNotStrictEquals, assertObjectMatch, assertRejects, assertStrictEquals, assertStringIncludes, assertThrows, fail) with the @std signatures. assertEquals, assertNotEquals, assertStrictEquals, assertNotStrictEquals, assertMatch, assertObjectMatch and fail call deepStrictEqual, notDeepStrictEqual, strictEqual, notStrictEqual, match, partialDeepStrictEqual and fail of node:assert/strict; a msg argument goes in front of Node's message, so the diff stays. The others are a few lines each and throw the node:assert AssertionError. assertThrows and assertRejects keep both @std overloads (message only, or ErrorClass with optional msgIncludes and msg), return the error typed as ErrorClass, and keep the @std rules: a class check fails a non-Error value, and assertRejects fails when fn throws or returns no promise. assertExists, assertInstanceOf, assertStrictEquals and assertFalse keep their asserts signatures. AnyConstructor uses `never` parameters instead of `any`, since oxlint forbids explicit any.

test-kit/mock keeps spy, stub and assertSpyCalls, the only exports the tests use (the Spy and Stub types stay exported). spy records calls with node:test mock.fn, stub replaces the method with mock.method, and assertSpyCalls reads callCount(). Neither has the @std surface (calls as args/returned/error/self, original, restored, restore(), fake) or Symbol.dispose for `using`, so each spy is a small wrapper function that delegates to the node:test mock and adds those members. Unlike @std, stub cannot replace a property that is undefined (mock.method needs a function); no test does that.

capture.ts and leaks.ts build the node:assert AssertionError (options object) instead of the @std one.

Semantic differences between @std equal and deepStrictEqual: one test failed. config/file/loader.test.ts "reads TOML tables and integers" compared smol-toml output, which uses null-prototype tables, with object literals; @std treats a null prototype and Object.prototype as equal, deepStrictEqual does not. The expectation now builds null-prototype tables. Other known differences that no test hit: -0 against 0 fails now, and class instances are compared by own enumerable properties and prototype identity instead of @std's walk over every key up the prototype chain.

@std/assert and @std/testing are gone from test-kit's package.json, the root .npmrc held only the @jsr registry line and is deleted, and `pnpm install` dropped seven @jsr packages from pnpm-lock.yaml. No package.json or pnpm-lock.yaml mentions @jsr/ or npm:@jsr, and no .npmrc is left; the recipes lost theirs in TASK-227. `pnpm install --frozen-lockfile` passes. Docs updated: test-kit README, AGENTS.md (the test-kit rule now names node:assert and the node:test mock), docs/agents/architecture-and-code.md, and the registry rule in tooling-standards node-and-packages.md. `pnpm ok` printed "All checks passed!".
<!-- SECTION:NOTES:END -->
