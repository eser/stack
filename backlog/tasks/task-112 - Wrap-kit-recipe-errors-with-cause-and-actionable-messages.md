---
id: TASK-112
title: Wrap kit recipe errors with cause and actionable messages
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - kit
  - errors
dependencies: []
references:
  - pkg/@eserstack/kit/recipes/recipe-applier.ts
  - pkg/@eserstack/kit/recipes/registry-fetcher.ts
priority: low
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
applyFromFiles in pkg/@eserstack/kit/recipes/recipe-applier.ts:383-386 rethrows 'Failed applying ... Cause: ${msg}' and keeps only the message. The registry-fetcher.ts catch blocks at lines 130, 195 and 205 drop the original error, and the handlers flatten every failure to { _tag, message }. Rules: coding-practices: Error Wrapping, Actionable Error Messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Errors are Error subclasses created with { cause }, and messages name the operation instead of starting with 'Failed'
- [x] #2 Tests check the cause chain on a failed apply and a bad registry file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

kit: Verified. recipe-applier.ts and registry-fetcher.ts throw Error subclasses created with { cause }. Messages name the operation, and no message starting with 'Failed' is left in kit. The handlers keep { _tag, message } and add `cause`; message is the chain that formatErrorChain renders, with terminal control sequences stripped and the walk stopped after 10 levels. The bridge strings that the narrower RecipeNotFound and TemplateNotFound checks match exist both at HEAD and in the working tree: "template 'X' not found", "recipe 'X' not found", and kitfx's `recipe %q not found`.
<!-- SECTION:NOTES:END -->
