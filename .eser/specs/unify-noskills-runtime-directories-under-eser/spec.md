# Spec: unify-noskills-runtime-directories-under-eser

## Status: completed

## Concerns: long-lived, beautiful-product, open-source

## Discovery Answers

### status_quo

Three sibling hidden dirs (.state/.sessions/.events/) at .eser/ root with
different lifecycles and consumers, cluttering layout and splitting a single
domain (runtime state) across three filesystem entries. [STATED in plan Context
section]

_-- Eser Ozvataf_

### ambition

1-STAR: three flat hidden dirs (.eser/.state/, .eser/.sessions/, .eser/.events/)
with three .gitignore entries, implicit domain grouping, developers must
mentally link the trio as 'related runtime state.' 10-STAR: one .eser/.state/
umbrella with explicit progresses/sessions/events subdirs, single .gitignore
entry, domain grouping obvious from ls -la, self-documenting filesystem, zero
'where does X live?' friction for contributors reading the codebase, path
semantics obvious from directory name. [STATED in plan Benefits + user
expansion]

_-- Eser Ozvataf_

### reversibility

Reversible in theory (code change plus reverse one-shot migration).
LOW-REVERSIBILITY in practice once shipped: users who already auto-migrated
would need reverse migration on rollback. One-way door, so migration code must
be correct first time. [INFERRED from plan migration strategy]

_-- Eser Ozvataf_

### user_impact

TRANSPARENT for runtime users: auto-migration handles existing .eser/ dirs on
first run. Zero behavior change (state machine, session GC, event append
semantics identical). IMPACT on contributors/external scripts that grep for
.eser/.state/ or reference these paths in custom hooks/CI - they'll need to
update path references post-upgrade. Migration logs one-time notice pointing to
changelog. [STATED]

_-- Eser Ozvataf_

### verification

Verification: (1) deno task cli ok full precommit; (2) deno test
pkg/@eser/noskills/ including new persistence.migration.test.ts with legacy
fixture + idempotency assertion; (3) fresh-install scaffold test (mkdir + nos
init + assert dir structure); (4) legacy migration manual test (pre-seed old
layout + run any nos command + assert new paths exist and old are gone); (5)
idempotency recheck; (6) e2e spec flow; (7) grep sanity check for zero legacy
matches outside migration code. [STATED in plan Verification section]

_-- Eser Ozvataf_

### scope_boundary

NOT in scope: (1) changing state machine semantics, phase names, or workflow
logic; (2) renaming individual files like state.json/events.jsonl (only parent
dirs move); (3) schema-version stamp file (premise Q3 rejected); (4) changing
what goes INTO any of the three files; (5) generalized migration framework
(one-shot only); (6) deprecation warnings beyond a one-time info log; (7)
performance optimization, logging overhaul, or unrelated polish.
[STATED/INFERRED]

_-- Eser Ozvataf_

## Migration & Deprecation (long-lived)

_To be addressed during execution._

## Backward Compatibility (long-lived)

_To be addressed during execution._

## Contributor Guide (open-source)

_To be addressed during execution._

## Public API Surface (open-source)

_To be addressed during execution._

## Out of Scope

- NOT in scope: (1) changing state machine semantics, phase names, or workflow
  logic
- (2) renaming individual files like state.json/events.jsonl (only parent dirs
  move)
- (3) schema-version stamp file (premise Q3 rejected)
- (4) changing what goes INTO any of the three files
- (5) generalized migration framework (one-shot only)
- (6) deprecation warnings beyond a one-time info log
- (7) performance optimization, logging overhaul, or unrelated polish.
  [STATED/INFERRED]

## Tasks

- [x] task-1: Update path constants and exported paths object in persistence.ts
      (add PROGRESSES_DIR, move
      SPEC_STATES_DIR/STATE_FILE/SESSIONS_DIR/EVENTS_DIR under .eser/.state/,
      extend paths with progressesDir and eventsFile). Files:
      pkg/@eser/noskills/state/persistence.ts.
- [x] task-2: Update scaffoldEserDir() to create new nested layout and collapse
      .gitignore template to single .state/ entry. Files:
      pkg/@eser/noskills/state/persistence.ts.
- [x] task-3: Implement migrateLegacyLayout(root) using .eser/.state/state.json
      file-vs-dir sentinel with two-phase atomic rename; invoke from
      scaffoldEserDir and readState entry points. Files:
      pkg/@eser/noskills/state/persistence.ts.
- [x] task-4: Centralize events path constants: remove local
      EVENTS_DIR/EVENTS_FILE in dashboard/events.ts and re-export from
      persistence.paths. Files: pkg/@eser/noskills/dashboard/events.ts.
- [x] task-5: Update hardcoded path strings in command call-sites (run.ts line
      136+404 blocked.log, watch.ts lines 136+399+452, next.ts lines 1111+1129,
      purge.ts lines 302+339, invoke-hook.ts 11 sites) to route through
      persistence.paths.progressesDir. Files:
      pkg/@eser/noskills/commands/run.ts, pkg/@eser/noskills/commands/watch.ts,
      pkg/@eser/noskills/commands/next.ts, pkg/@eser/noskills/commands/purge.ts,
      pkg/@eser/noskills/commands/invoke-hook.ts.
- [x] task-6: Update existing tests for new paths (session.test.ts lines
      48/63/209, events.test.ts lines 16/81-85, agentless.test.ts line 284,
      spec-plan.test.ts line 45, purge.test.ts line 72, pack/pack.test.ts lines
      37-44). Files: pkg/@eser/noskills/commands/session.test.ts,
      pkg/@eser/noskills/dashboard/events.test.ts,
      pkg/@eser/noskills/commands/agentless.test.ts,
      pkg/@eser/noskills/commands/spec-plan.test.ts,
      pkg/@eser/noskills/commands/purge.test.ts,
      pkg/@eser/noskills/pack/pack.test.ts.
- [x] task-7: Write new persistence.migration.test.ts with legacy-layout
      fixture, assertions that new paths have correct contents and old are gone,
      .gitignore updated, and idempotency on second invocation. Use
      @std/testing/bdd. Files:
      pkg/@eser/noskills/state/persistence.migration.test.ts.
- [x] task-8: Update documentation: README.md line 344, README-HOW.md lines
      486-493 directory diagram, persistence.ts/schema.ts module docstrings.
      Files: pkg/@eser/noskills/README.md, pkg/@eser/noskills/README-HOW.md,
      pkg/@eser/noskills/state/persistence.ts,
      pkg/@eser/noskills/state/schema.ts.
- [x] task-9: Run deno task cli ok and deno test pkg/@eser/noskills/ and grep
      sanity check for zero legacy .eser/.sessions or .eser/.events matches
      outside migration code.

## Verification

- Verification: (1) deno task cli ok full precommit
- (2) deno test pkg/@eser/noskills/ including new persistence.migration.test.ts
  with legacy fixture + idempotency assertion
- (3) fresh-install scaffold test (mkdir + nos init + assert dir structure)
- (4) legacy migration manual test (pre-seed old layout + run any nos command +
  assert new paths exist and old are gone)
- (5) idempotency recheck
- (6) e2e spec flow
- (7) grep sanity check for zero legacy matches outside migration code. [STATED
  in plan Verification section]
