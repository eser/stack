---
id: TASK-192
title: 'Write the Deno.test to node:test codemod'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 20:11'
labels:
  - codemod
  - tests
milestone: m-0
dependencies:
  - TASK-175
  - TASK-186
  - TASK-185
priority: high
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write etc/codemods/tests.ts, a Node script on oxc-parser from the root devDependencies (M0-T20), with dry-run mode and path filters. Transforms:
- Deno.test in all three call shapes becomes node:test test().
- t.step becomes t.test, including the object form.
- ignore becomes skip.
- sanitizeOps, sanitizeResources, sanitizeExit and permissions keys are deleted.
- @std/testing/bdd becomes node:test, under the same bdd namespace name, including the 9 object-form describe and it calls.
It leaves the @eserstack/test-kit imports alone. The file header names M1-T37 as the removal task, and the folder is excluded from deno.json and validate-runtime-js-apis until then.

Decisions this task waits on: decision-2 (What the root package.json may carry); decision-7 (Test runner and assertion library); decision-35 (Parser for the codemods).

Plan key: M0-T18. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fixtures cover every transform, and `node --test etc/codemods` passes from the repo root
- [x] #2 A dry run reports about 2,420 Deno.test, 93 t.step, 106 sanitizer keys and 134 bdd files, and lists the sites it could not transform
- [x] #3 A second run changes nothing
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. etc/codemods/tests.ts on oxc-parser (shared helpers in etc/codemods/lib.ts: git-tracked and untracked file listing that skips deleted, node_modules, third-party and the folder itself; parse; walk; nested source edits; --dry-run, --filter and path arguments). Transforms: Deno.test(name, fn), (name, options, fn), ({ name, fn, ... }) with method or property fn, ({...}, fn), a named function alone, Deno.test.ignore and .only, into nodeTest.test(name, [options,] fn) with 'import * as nodeTest from "node:test"' (a namespace import, as validate-code-conventions requires, and no clash with local 'test' variables); t.step to t.test in both forms for every context name a test callback declares; ignore to skip, only kept, sanitizeOps/sanitizeResources/sanitizeExit/permissions deleted; @std/testing/bdd imported from node:test under the same namespace, object-form bdd.describe/bdd.it made positional, beforeAll/afterAll renamed before/after, .ignore to .skip, (name, options, fn) options converted. test-kit imports are untouched. A site in an unknown shape, an option with no node:test equivalent, or Deno.test used other than as a call is left and listed. Dry run on the tree: 432 files read, 425 would change, 2,430 Deno.test, 94 t.step, 108 sanitizer keys, 0 permissions keys as options (the one 'permissions:' in noskills purge.test.ts is test data and is left alone), 46 ignore-to-skip, 134 bdd files, 9 object-form bdd calls, 0 unhandled sites. An in-memory run over the tree transformed every file twice: 0 files changed on the second run and every output parses. In the TASK-175 scratch copy, converting fp, workflows and kit and running node --test passed 165, 49 and 246 tests. Fixtures (etc/codemods/tests.test.ts, 10 tests) cover every transform, the counts, idempotency and the unhandled list. 'node --test etc/codemods' runs from the repo root: node loads a directory argument as a module, so etc/codemods/package.json (private, type module) points main at all.test.ts, which imports every test file. The precommit workflow gained a codemod-tests step that runs it. deno.json and validate-runtime-js-apis exclude etc/codemods/; the headers name M1-T37 (TASK-231) as the removal task; docs/agents/documentation-and-tooling.md describes the folder. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
