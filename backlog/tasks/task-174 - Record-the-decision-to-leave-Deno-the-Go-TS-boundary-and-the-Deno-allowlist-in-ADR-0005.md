---
id: TASK-174
title: >-
  Record the decision to leave Deno, the Go/TS boundary and the Deno allowlist
  in ADR 0005
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 16:37'
labels:
  - docs
  - adr
  - decision
milestone: m-0
dependencies: []
priority: high
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write docs/adr/0005-leave-deno-for-node-and-go.md.
- Context, with facts from deno.com/blog/cloudflare (2026-10-09): one more year of monthly bug-fix releases, then development ends; no Deno 3; Deno Deploy shuts down in six months; JSR keeps operating on Cloudflare.
- Decision: Node 26 with pnpm, oxlint, oxfmt, tsc 7 and node:test, in one cutover; Bun dropped. Go owns the binaries, the working parts and the business logic (decision-22). TS libraries keep their public API and types and delegate their logic to Go through the bridge, which stays: it loads through node:ffi, falls back to the WASM build (WASI) when node:ffi cannot load, and otherwise reports a clear error and exits; koffi is removed (decision-37, decision-45). The bridge's Go module stays, so the repo keeps two go.mod files. Go domain code lives in the pkg/ajan *fx packages, because pkg/ajan/api/business is empty; fix docs/agents/architecture-and-code.md:11-13 to match.
Record the owner's answer to every needsOwner decision in this plan. Add three appendices:
- The Deno and Bun reference allowlist that the M1-T37 audit checks against: CHANGELOG history, ADRs 0001 to 0004, backlog history, the validator patterns, and, per decision user-deno-projects, the user-project support files by path.
- The root devDependencies policy (decision root-devdeps).
- The integration-agent protocol (decision red-window-commits).
Also:
- Add a decision record in backlog/decisions/ and milestone files M0 to M6 in backlog/milestones/.
- Add a line to ADR 0004 saying its server-bundler and Deno resolution sections are superseded by 0005; its bare-specifier decision stays.

Plan key: M0-T1. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/adr/0005-leave-deno-for-node-and-go.md exists, follows the format of 0001 to 0004, and has status Accepted after owner review
- [x] #2 Every needsOwner decision in this plan has a recorded answer, and the three appendices exist
- [x] #3 backlog/milestones holds M0 to M6 with this plan's exit criteria, and backlog/decisions links the ADR
- [x] #4 ADR 0004 has a superseded-in-part line pointing to 0005
- [x] #5 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The planning run already created the decision records (decision-1 to decision-45), the milestone files m-0 to m-6 and the plan overview (doc-1). This task records the owner's answers in ADR 0005 and sets each decision's status.

2026-10-15: the owner accepted every recommendation in decision-1 to decision-45, with these answers of their own: the bridge stays and loads through node:ffi first, then the WASM build, then a clear error and exit (decision-37, decision-45); koffi, Deno and Bun are removed; the minimum Node is 26.9 (decision-14); Go owns the business logic and TS libraries delegate through the bridge (decision-22). ADR 0005 records these as decided.

2026-10-24: wrote docs/adr/0005-leave-deno-for-node-and-go.md in the 0003/0004 section format, with status Accepted because it records decisions the owner accepted on 2026-10-15, 2026-10-23 and 2026-10-24; the ADR text itself still deserves an owner read. Appendix A lists the owner's answer to decision-1 to decision-60, B the Deno and Bun reference allowlist (decision-12), C the root devDependencies policy (decision-2, plus Playwright from decision-57), D the integration-agent protocol (decision-1). ADR 0004's status names 0005 as superseding it in part. docs/agents/architecture-and-code.md now says Go domain code lives in pkg/ajan/*fx and api/business is empty. decision-61 links the ADR; milestones m-0 to m-7 already existed. Full gate passed.
<!-- SECTION:NOTES:END -->
