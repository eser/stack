---
id: TASK-124
title: Make the functions README examples and pipeline middleware types compile
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - functions
  - docs
  - types
dependencies: []
references:
  - pkg/@eserstack/functions/README.md
  - pkg/@eserstack/functions/pipeline.ts
priority: medium
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The functions README destructures `const { task } = functions;` (README.md:158, :209, :234) and then writes types like task.Task<...> and handler.Handler<...> (:213, :294), which a destructured value cannot provide; `deno check --doc-only` stops on a syntax error at the block for lines 195-200. Context.next in pkg/@eserstack/functions/pipeline.ts:19 returns AsyncGenerator<Result<unknown, unknown>>, so `yield* ctx.next()` inside a collect<string, Error>() middleware fails with TS2345, which breaks the collect() JSDoc example and the matching README example. Rule: documentation-conventions: Code Examples.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Context is generic over the pipeline's result types and delegating to next type-checks
- [x] #2 README examples use full namespace access for types and define their placeholder helpers
- [x] #3 deno check --doc-only on the README and deno check --doc on pipeline.ts pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: Context<S, T, E> is generic over the pipeline's result types. `deno check --doc-only pkg/@eserstack/functions/README.md` and `deno check --doc pkg/@eserstack/functions/pipeline.ts` both pass. No README in the unit destructures a package namespace.
<!-- SECTION:NOTES:END -->
