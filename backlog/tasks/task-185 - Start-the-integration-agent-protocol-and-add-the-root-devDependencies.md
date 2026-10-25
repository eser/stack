---
id: TASK-185
title: Start the integration-agent protocol and add the root devDependencies
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:06'
labels:
  - tooling
  - pnpm
  - dependencies
  - process
milestone: m-0
dependencies:
  - TASK-174
priority: high
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today root node_modules holds only @types, and the root package.json has only @types/node as a devDependency. That means etc/scripts tests, etc/codemods and .agents scripts cannot resolve workspace packages or tools.
Per decisions root-devdeps and red-window-commits:
- Name the integration agent. From this task to the end of M2, it alone edits pnpm-lock.yaml and the root package.json and lands every package.json dependency change, as one commit per batch.
- Record the protocol in the task notes and in the ADR 0005 appendix.
- Add oxc-parser, exactly pinned and vetted under tooling-standards, as the first root devDependency, for the codemods.
M0-T17 adds @eserstack/test-kit (workspace:*) through the same agent, and M1-T1 adds the toolchain. Any later root devDependency must be named in the policy.
This task also serializes the dependency edits that M0-T13, M0-T14, M0-T15 and M0-T17 need.

Decisions this task waits on: decision-1 (How agents commit and coordinate, from M0 on and while the gate is red inside M1); decision-2 (What the root package.json may carry); decision-35 (Parser for the codemods).

Plan key: M0-T20. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The protocol and the root devDependencies policy are recorded
- [x] #2 `node -e "import('oxc-parser')"` resolves from the repo root after `pnpm install --frozen-lockfile`
- [x] #3 Only the integration agent's commits touch pnpm-lock.yaml from this task onward (checked with git log in M0 review)
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. Integration agent: from this task to the end of M2 the role is held by one named agent session; other agents send it their dependency changes and never edit pnpm-lock.yaml or the root package.json themselves. The protocol is ADR 0005 Appendix D and the root devDependencies policy Appendix C. Vetting of oxc-parser (decision-35): purpose is the M0-T18/T19 codemods, which need a full TS parser (no stdlib or workspace package parses TS); MIT; maintained by the oxc project (npm maintainer boshen), release 0.155.0 on 2026-10-19 after weekly releases; no install, preinstall or postinstall script, so no allowBuilds entry; one dependency (@oxc-project/types) plus optional platform bindings; pnpm audit lists no oxc advisory; exit cost is the codemods only, which M1-T37 deletes. Added with pnpm add -D -w --save-exact oxc-parser@0.155.0; pnpm install --frozen-lockfile then passes and node -e "import('oxc-parser')" resolves from the root. AC #3 is a process check for the M0 review. pnpm audit still reports 20 advisories in existing transitive dependencies (@modelcontextprotocol/sdk, body-parser, fast-uri, hono, ip-address, proxy-addr, sharp, source-map-js, zod), none new. One gate run failed once in shell/exec/command.ffi.test.ts with 'getcwd: cannot access parent directories'; it passed alone three times and on the next full run, so it is a flake, likely from the tests that chdir (posts/config.test.ts, ajan wasm/ffi resolve.test.ts). deno task cli ok passed.
<!-- SECTION:NOTES:END -->
