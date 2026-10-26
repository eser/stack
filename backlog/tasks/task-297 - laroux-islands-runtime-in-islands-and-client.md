---
id: TASK-297
title: 'laroux: islands runtime in /islands and /client'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-284
  - TASK-293
priority: medium
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 8. `/islands`: strategy constructors and types (load, idle, visible, media, interaction, signal, only, never, any, custom), StrategyHandler and the module-augmentation types. `/client`: Island and Gate as framework references, ClientOnly as an alias of `only()`, the gate registry with the generation counter, the second-render self-open rule, the pre-hydration `laroux-island` custom element with the built-in handlers and interaction capture, the alias hold policy in the chunk loader (production chunks and DevEngine module URLs), SavedHtml, the per-island error boundary with one import retry, the event pair `laroux:island-hydrated` and `laroux:island-error`, and useIslandState, hydrateIsland, openIslandSignal, prefetchIsland. Follow L-S3's results for the update rule, the replay contract, the marker element and the zero-JS default.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4e. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unit tests cover strategy types (a misspelled custom name and a Date option fail to type-check), the registry rules and every built-in handler against a fake DOM
- [ ] #2 Browser tests show visible() requests its chunk only on scroll, never() never requests its chunk, interaction replay follows doc-3 section 8.4, and a late-streamed island registers
- [ ] #3 A test shows an action tree commit hydrates retained dehydrated islands without a fallback flash
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
