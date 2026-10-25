---
id: TASK-193
title: Write the lint-pragma and bench codemods
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 20:11'
labels:
  - codemod
  - lint
  - bench
milestone: m-0
dependencies:
  - TASK-175
  - TASK-185
priority: high
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two codemods, both on oxc-parser from the root devDependencies:
- etc/codemods/lint-pragmas.ts rewrites `deno-lint-ignore` and `deno-lint-ignore-file` into oxlint-disable comments, using the rule map from M0-T2 (no-explicit-any to typescript/no-explicit-any, no-top-level-await to node/no-top-level-await, and so on). It drops and reports pragmas for rules that no longer exist, and rewrites the single deno-fmt-ignore.
- etc/codemods/benches.ts rewrites the uniform `Deno.bench(name, { group, baseline }, fn)` calls to mitata group, bench and summary.
Both headers name M1-T37 as the removal task.

Decisions this task waits on: decision-2 (What the root package.json may carry); decision-35 (Parser for the codemods); decision-36 (Replacement for Deno.bench).

Plan key: M0-T19. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The dry run maps all 563 pragmas with zero unknown rule names
- [x] #2 Bench fixtures with group and baseline convert and run under node
- [x] #3 Both codemods are idempotent, and their fixture tests pass under `node --test etc/codemods`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. etc/codemods/lint-pragmas.ts reads real comments only (oxc-parser comments), so pragma text in strings and docs stays: '// deno-lint-ignore a b' to '// oxlint-disable-next-line a2, b2', '// deno-lint-ignore-file a' to '/* oxlint-disable a2 */' (block comments keep block form), deno-fmt-ignore to oxfmt-ignore (checked: oxfmt honours oxfmt-ignore and prettier-ignore; deno-fmt-ignore-file would be listed, none exists). RULE_MAP covers the 89 deno rules the TASK-175 mapping covers (eslint rules by their bare names, as the spike verified, the others plugin-prefixed: typescript/no-explicit-any, node/no-top-level-await, typescript/ban-types, no-restricted-imports for no-external-import, ...); DROPPED lists the 15 gaps with what covers them; a pragma left with no rule is removed, with its line when it is alone; an unknown rule name leaves the pragma and is reported. Dry run: 263 files, 538 line pragmas plus 24 file pragmas plus 1 deno-fmt-ignore (563), zero unknown rule names, one dropped rule (camelcase in pkg/@eserstack/posts/adapters/twitter/types.ts:4, covered by validate-naming-and-todos). etc/codemods/benches.ts rewrites the top-level Deno.bench(name, { group, baseline }, fn) calls: the benches of a group move to the group's first bench as mitata.group(group, () => mitata.summary(() => { mitata.bench(name, fn).baseline(); ... })), an ungrouped bench becomes mitata.bench in place, and 'await mitata.run()' (with an oxlint top-level-await directive) closes the file; moving is safe because mitata runs bench bodies only in run(). Any other option or shape is listed. Dry run: 15 files, 154 benches, 66 groups, 66 baselines, 0 unhandled. mitata 1.0.34 joined the root devDependencies (allowed by ADR 0005 Appendix C, decision-36). Both codemods are idempotent on fixtures and on the whole tree in memory (262 and 15 files, 0 changes on the second run, every output parses). Fixtures: lint-pragmas.test.ts (line, trailing, multi-rule, file, dropped-only and mixed pragmas, fmt-ignore, string and doc text, an unknown rule) and benches.test.ts (two groups with a baseline, an ungrouped bench, an unknown option, and the converted fixture executed with node, whose output names every bench and prints the summary); node --test etc/codemods passes 16 tests. cli/startup.bench.ts is still converted by the codemod; decision-36 deletes it, which TASK-205 does. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
