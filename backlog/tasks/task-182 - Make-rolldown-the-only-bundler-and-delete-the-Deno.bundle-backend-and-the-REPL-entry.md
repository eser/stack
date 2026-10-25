---
id: TASK-182
title: >-
  Make rolldown the only bundler and delete the Deno.bundle backend and the REPL
  entry
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:55'
labels:
  - bundler
  - laroux-bundler
  - deno-removal
milestone: m-0
dependencies:
  - TASK-181
priority: high
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bundler work, one commit per package:
- laroux-bundler: make rolldown the default (system.ts:655); remove the Deno import-map copy workaround (system.ts:642-650, copyConfigFilesWithImportMaps at :1303-1345); narrow BundlerBackend in config.ts:12; drop the platform 'deno' option (domain/bundler.ts:59, :227).
- bundler: delete backends/deno-bundler.ts, deno-bundle-layout.ts and their tests, the ./backends/deno-bundler export and the 'deno-bundler' member of BundlerBackend (types.ts:307).
Remove `bundle` from the root deno.json `unstable` list. Remove the `repl` manifest script, which needs --unstable-bundle, together with the two files that exist only to feed it: repl-init.ts and the barrel pkg/@eserstack/mod.ts. The barrel also holds commented-out jsx-runtime and laroux-runtime exports. Check first that nothing else imports the barrel. Set backlog task-152, which targets these files, to a closed state with a note naming this task. Its TODO(TASK-NEW) placeholder was already replaced by task-48. Update both READMEs and record the deno-bundler backend removal for M1-T36.

Plan key: M0-T9. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -n 'Deno.bundle\|deno-bundler'` returns nothing outside history files
- [x] #2 repl-init.ts and pkg/@eserstack/mod.ts are deleted, nothing imports them, and backlog task-152 is closed with a note
- [x] #3 A fixture build produces the dist/server layout that route dispatch loads
- [x] #4 Root deno.json unstable no longer lists bundle
- [x] #5 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. bundler: deleted backends/deno-bundler.ts, deno-bundle-layout.ts and both tests, the ./backends/deno-bundler export and its re-exports in mod.ts and backends/mod.ts; BundlerBackend and CreateBundlerOptions are rolldown-only; README updated with an Upgrading entry. laroux-bundler: rolldown is the default server backend, BundlerBackend is "rolldown", copyConfigFilesWithImportMaps and adjustRelativePaths (Step 21) are gone together with the now unused @eserstack/codebase/package import, BundleOptions.platform is "browser" | "node", and every comment and README passage about Deno.bundle was rewritten; the mod.ts example uses rolldown. Root deno.json unstable no longer lists bundle. The repl manifest script, repl-init.ts and the pkg/@eserstack/mod.ts barrel are deleted (only repl-init.ts imported the barrel). .github/ARCHITECTURE.md names only the Rolldown backend. TASK-152 was already Done; it got a note naming this task. The removal is recorded on TASK-230 (M1-T36). git grep 'Deno.bundle\|deno-bundler' now matches only backlog, CHANGELOG and ADR history. AC #3: laroux-server's server-modules test builds a fixture with rolldown and loads its dist/server pages, route.ts and proxy.ts through route dispatch, before and after a rebuild. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
