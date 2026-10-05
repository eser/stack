---
id: TASK-88
title: >-
  Report posts fan-out partial failures the same way in every wiring and to the
  agent
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - posts
  - bug
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/ai/triggers.ts
  - pkg/@eserstack/posts/application/handlers.ts
priority: medium
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
mapToToolResponse in adapters/ai/triggers.ts:48 sends only error.message to the model, so a FanOutPartialError or ThreadPartialError tells the agent neither which platform published nor which post IDs exist. In application/handlers.ts:163-175, composePostToAllHandler without auth providers falls back to PostService.composePostToAll, which drops failed platforms silently and runs them concurrently; with auths it runs them in order and returns FanOutPartialError. searchPostsAllHandler also uses a different per-platform default on each path. TASK-58 rewrites the tool descriptions these results must match.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both handler paths report partial failures and apply defaults the same way
- [x] #2 Tool responses for the two partial errors include the posted posts and the per-platform failures
- [x] #3 The compose_post_all and post_thread descriptions match the new responses
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

posts: Checked independently.
- reportFanOut serves both composePostToAllHandler paths. PostService.composePostToAll is sequential. DEFAULT_MAX_RESULTS_PER_PLATFORM (application/defaults.ts) is used by the handlers, PostService, FeedAggregator and the tool descriptions.
- failureContent in triggers.ts maps FanOutPartialError to {error, posted, failed[{platform, error}]} and ThreadPartialError to {error, posted, failedIndex, cause}.
- The compose_post_all and post_thread descriptions name those fields, and tool-definitions.test.ts checks it.
- Tools that return nothing now return content null instead of undefined.
- handlers.test.ts runs each case with and without auth providers.
<!-- SECTION:NOTES:END -->
