---
id: TASK-197
title: Apply the lint-pragma codemod repo-wide
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 15:30'
labels:
  - cutover
  - codemod
  - oxlint
milestone: m-1
dependencies:
  - TASK-196
  - TASK-193
priority: high
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run etc/codemods/lint-pragmas.ts over every tracked .ts and .js file in one mechanical commit, then run oxfmt. Wave A is sequential: this runs after M1-T2 and before M1-T4, and no wave B worktree branches before it lands.

Plan key: M1-T3. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -n 'deno-lint-ignore\|deno-fmt-ignore'` returns nothing
- [x] #2 `pnpm exec oxlint --report-unused-disable-directives` reports no unknown rule names or unused directives
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25. `node etc/codemods/lint-pragmas.ts` over the tracked sources: 274 files read, 273 changed, 566 line pragmas and 21 file pragmas rewritten, 1 deno-fmt-ignore, no unknown rule names. One rule was dropped: camelcase in posts/adapters/twitter/types.ts, which validate-naming-and-todos covers. oxfmt ran afterwards and `oxfmt --check` is clean.
- Unused directives, fixed by hand. `oxlint --report-unused-disable-directives` reported 11:
  - Two no-await-in-loop directives (codebase/install.ts, ai/adapters/ajan-bridge.ts) no longer sat on the await line after the oxfmt reformat moved the await down a line; they now sit right above the await.
  - Nine guarded nothing in oxlint and were removed: four default-param-last (laroux/router/api-types.ts, kit/recipes/registry-fetcher.ts twice, http/middlewares/rate-limiter.ts), where oxlint misses a default before an optional parameter; four no-restricted-imports on `node:` imports (standards/cross-runtime/adapters/deno.ts, logging/context.ts, and the file pragmas of etc/scripts/release-notes-from-changelog.ts and validate-skills.ts, which keep no-console); and one no-undef in .agents/hooks/decision-nudge.js.
  - Now 0 unused directives and 0 unknown rule names.
- Pragma text in docs was updated to the oxlint form: .agents/skills/coding-practices/references/readability.md, directives/03-contributing.md, TODOS.md, and a commented-out line in .eser/recipes/jsx-runtime-app/root.test.tsx.
- `git grep -n 'deno-lint-ignore\|deno-fmt-ignore'` still matches only etc/codemods/ (the codemod and its tests, deleted in TASK-231) and backlog/ records that describe the old pragmas.
- oxlint still reports 13 real findings where it is stricter than deno lint: react/no-children-prop 5 (laroux-server 4, laroux-react/client.ts 1), typescript/ban-types 3 (primitives/functions.ts), no-await-in-loop on a nested for await 2 (codebase/package/workspace.ts), no-redeclare 1 (posts bluesky social-api.ts), no-this-alias 1 (httpclient/h3-fetch.test.ts), one-var 1 (jsx-runtime/encoder.ts, deleted in TASK-210). These are the ones the TASK-175 spike listed, and the oxlint gate step (TASK-200, TASK-231) has to clear them.
- `deno test -A --no-check` passes 3,627 tests with 0 failures on the result.
<!-- SECTION:NOTES:END -->
