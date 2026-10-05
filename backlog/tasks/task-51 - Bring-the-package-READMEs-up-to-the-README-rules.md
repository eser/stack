---
id: TASK-51
title: Bring the package READMEs up to the README rules
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - docs
dependencies: []
references:
  - pkg/@eserstack/
priority: medium
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
9 packages have no README (agents, formats, httpclient, mux, noskills-client, noskills-server-worker, noskills-web, posts, webtransport). 18 READMEs show named or sub-path imports instead of the namespace pattern (ai, bundler, cache, codebase, events, fp, functions, http, jsx-runtime, laroux-bundler, laroux-react, laroux-server, primitives, shell, standards, streams, testing, workflows). 16 lack the emoji title or the Links footer (kit, the ajan and ajan-* packages, laroux-bundler, laroux-react, laroux-runtime, laroux-server, noskills; ai and streams lack the footer). Rule: documentation-conventions readmes.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every package has a README with the required structure
- [x] #2 README examples use namespace imports
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

codebase: Covers only this package's part of TASK-51. README examples use namespace imports. The API example imports from @eserstack/codebase/mod; I confirmed the package.json export and that getCommitsBetween, getCurrentBranch and discoverPackages are exported. The validation example matches what validation/mod.ts exports, and noskills/module.ts exports moduleDef as the cli-support example expects. Every command in module.ts appears in the README tables ('gh' is covered by its GitHub section). The emoji title and footer are kept.

laroux-server: The laroux-server README part is done and checked. The other packages belong to other units.

workflows: The workflows part is done: README and JSDoc examples use namespace imports and now type-check. Other packages belong to other units.

shell: The shell part is done: Quick Start, namespace-import examples, examples that match the code and type-check. The other packages listed in TASK-51 belong to other units.

small-a: The fp, functions and streams READMEs use namespace imports of package roots, and streams now has the 🔗 Links footer. The verifier also fixed the config README, whose examples called APIs the package root does not export. The other packages' READMEs belong to other units.

Orchestrator check: every pkg/@eserstack package has a README with an emoji title and a Links footer, and no README example uses a named import.
<!-- SECTION:NOTES:END -->
