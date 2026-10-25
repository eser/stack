---
id: TASK-186
title: Add the leaf @eserstack/test-kit package and route every test to it
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:26'
labels:
  - testing
  - tests
  - codemod
  - test-kit
milestone: m-0
dependencies:
  - TASK-174
  - TASK-185
priority: high
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
@eserstack/testing depends on @eserstack/standards (testing/package.json; mod.ts, temp-dir.ts and fake-fs.ts import it), and standards depends on primitives. The Go circular-deps check counts devDependencies (pkg/ajan/codebasefx/workspace_validators.go:45). A seam in @eserstack/testing would therefore create the cycles standards->testing->standards and primitives->testing->standards->primitives.
Per decision seam-location, add pkg/@eserstack/test-kit from the library-pkg recipe:
- private: true, with no workspace dependencies
- ./assert re-exports the @std/assert functions in use
- ./mock re-exports spy, stub and assertSpyCalls
- ./capture provides captureThrow and captureRejection, which return the thrown error for the ~59 call sites that use assertThrows or assertRejects results
Codemod the test files to test-kit: the 410 under pkg (git grep count) and the two etc/scripts tests, rewriting @std/assert, @std/testing/mock and jsr:@std/assert. The integration agent adds the test-kit devDependency to every package and to the root package.json in one lockfile commit. The import rewrite lands one commit per package.
Confirm that gen-jsr-manifests, deno-publish-check and the npm publish paths skip a private package; if they do not, add that skip here. @eserstack/testing keeps fake-fs, fake-server and temp-dir. M2-T4 reimplements test-kit on node:assert in one place. Update the package count in AGENTS.md (47 to 48).

Decisions this task waits on: decision-2 (What the root package.json may carry); decision-3 (Where the assertion and mock seam lives); decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-7 (Test runner and assertion library).

Plan key: M0-T17. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No test imports @std/assert, @std/testing/mock or jsr:@std/assert directly
- [x] #2 @eserstack/test-kit has no @eserstack/* dependency, and validate-circular-deps passes with test-kit as a devDependency of every package, standards and primitives included
- [x] #3 The test-kit modules have JSDoc, README examples with namespace imports, and their own tests; no publish path picks it up
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. New private package pkg/@eserstack/test-kit (private: true, no @eserstack/* dependency; depends on @std/assert and @std/testing): ./assert re-exports the 17 @std/assert functions the tests call plus AssertionError, ./mock re-exports spy, stub, assertSpyCalls and the Spy/Stub types, ./capture adds captureThrow and captureRejection. Each module has JSDoc with an example, the README shows namespace imports, and assert/mock/capture tests pass. A codemod rewrote 418 test files (every package's tests plus etc/scripts/dist-utils.test.ts, etc/scripts/package-export-roots.test.ts and the library-pkg recipe) from @std/assert, jsr:@std/assert@^1.0.16 and @std/testing/mock to the test-kit subpaths; @std/testing/bdd stays. Every package with tests, and the root package.json (decision-2 allows it), now lists @eserstack/test-kit as workspace:* in devDependencies; @std/assert (and @std/testing where nothing else used it) left those devDependencies. The library-pkg recipe uses test-kit too. Left on purpose: .eser/recipes/jsx-runtime-app/root.test.tsx (a template for users' projects, which have no test-kit) and a JSDoc example in logging/sinks.ts (not a test). gen-jsr-manifests now skips packages with private: true, so test-kit gets no deno.json and deno publish skips it (40 manifests, 9 not publishable); the npm bundles never import it. AGENTS.md says 48 packages and names the seam. validate-circular-deps and the full gate passed. The ~59 call sites that read assertThrows/assertRejects results keep using them for now; captureThrow/captureRejection are there for M2-T4.
<!-- SECTION:NOTES:END -->
