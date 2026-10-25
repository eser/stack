---
id: TASK-229
title: 'Skills, part two: release, coding, workflow, security, docs and frontend rules'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 16:00'
labels:
  - cutover
  - docs
  - skills
milestone: m-1
dependencies:
  - TASK-200
  - TASK-226
priority: medium
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite the remaining Deno rules:
- release-and-ci: SKILL.md description and release-process.md (:27, :56, :108-112, :137, :239, :243, :267), per decisions jsr-publishing and binaries, plus its evals. Add the rule that channels decide from the release, not the merge.
- coding-practices: readability.md (formatter owner, lint rule names, oxlint pragma syntax in examples, TODO tags and camelcase now enforced by the Go validator, and the TODO(owner) example fixed to the decided tag form) and resources-and-io.md (benches with mitata).
- workflow-practices: roles-and-boundaries.md loses the Deno permissions rule (decision deno-permission-rule) and the generated deno.json lines.
- security-rules.md: use Symbol.for("nodejs.util.inspect.custom") and remove DENO_ENV.
- documentation-conventions: replace the `deno run jsr:` justification for CLI-first packages (link backlog task-101) and the deno doc lint rule.
- frontend-practices: laroux.md:70 and bundling-and-loading.md:23.
- enrichment and eser-rules-manager: evals and skill-discovery.md:42.
- pkg/@eserstack/directives/03-contributing.md:49-52.

Decisions this task waits on: decision-20 (The documented command form for the gate and scripts); decision-21 (Required TODO tag form and what the validator reads); decision-44 (The permissions rule in workflow-practices).

Plan key: M1-T35. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -ni 'deno\|bun' .agents pkg/@eserstack/directives` returns nothing
- [x] #2 validate-skills and every evals/triggers.json pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- release-and-ci: the description and Always list name npm-only publishing, release binaries and install channels. release-process.md: generated manifests example is a bundle's `dist/package.json`; the preflight no longer lists a JSR dry run; Publishing Targets is npm only, with a Why citing ADR 0005 (decision-5); new rules Release Binaries (`eser dev compile`, fixed archive names, forwarding stubs retired by the owner; decision-8, 9, 38) and Channels Decide From the Release (install scripts, Homebrew and Nix decide from the release's archives, 404 prints `npm i -g` and exits non-zero; decision-11); verification, recovery and the action table drop JSR. triggers.json: two install-channel queries added, two Deno queries rewritten.
- coding-practices: readability.md names oxfmt, the `validate-naming-and-todos` checks for casing and `TODO(TASK-<number>)` (decision-21, decision-34) and the oxlint pragma form; resources-and-io.md benches with mitata (decision-36); inputs-and-config.md uses `runtime.path.join` and `process.cwd()` in its examples.
- workflow-practices: the permissions rule and its Deno example are gone (decision-44); generated-file example is a bundle's `dist/package.json`; new Never Do item for the integration agent's lockfile and root manifest (decision-1, pointing to tooling-standards); Checks says the hooks run the gate and only the owner turns them off for a branch; Ask First drops JSR and deno.extra.json. SKILL.md Always updated.
- security-practices: `Symbol.for("nodejs.util.inspect.custom")`; DENO_ENV removed from the environment-name rule (config reads ENV, APP_ENV, NODE_ENV); runtime.env reason reframed; one sentence on giving subprocesses only the variables they need (the least-privilege point decision-44 leaves to this skill).
- documentation-conventions: the CLI-first `/mod` exception is justified by the `.` export of released versions (links TASK-101); the doc lint is `eser codebase validate-docs` (decision-43); the em-dash examples use the npm step.
- frontend-practices: Rolldown is the only laroux-bundler backend; the "use client" semicolon comes from oxfmt. eser-rules-manager skill-discovery.md and the enrichment and eser-rules-manager trigger files no longer name Deno, JSR or Bun. pkg/@eserstack/directives/03-contributing.md names oxfmt, oxlint, `tsc --noEmit`, gofmt and golangci-lint.
- AC #1: `git grep -niw 'deno\|jsr\|bun'` on .agents and pkg/@eserstack/directives returns nothing; the literal pattern still matches 44 lines, all "bundle", "bundler" and "bundling" substrings. AC #2: validate-skills reports 0 errors and 0 warnings, every triggers.json parses, and oxfmt --check passes on the 19 changed files. The tree has no trigger runner and no behavior evals were run.
<!-- SECTION:NOTES:END -->
