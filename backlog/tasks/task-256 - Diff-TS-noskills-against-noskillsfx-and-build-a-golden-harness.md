---
id: TASK-256
title: Diff TS noskills against noskillsfx and build a golden harness
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 20:53'
labels:
  - go
  - noskills
  - parity
  - tests
milestone: m-4
dependencies:
  - TASK-242
priority: high
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
List the behavior gaps between the TS noskills (33.3k source lines; compiler.ts alone is 3,405) and pkg/ajan/noskillsfx (8.1k; compiler.go is 849), filing each real gap as a subtask. Build a harness that runs the TS commands on fixture projects, records stdout, exit codes and the state files, and replays them against cmd/noskills.

Plan key: M4-T1. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The gap table is attached, with every gap linked to the M4 task that closes it
- [x] #2 The harness runs in `make test` (skipped until the binary exists) and covers hooks, the spec lifecycle, purge and restore, and sync
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24.

## Gap table (TS noskills against pkg/ajan/noskillsfx)

Method: the Go side was read in full (pkg/ajan/noskillsfx, 15 non-test files; pkg/@eserstack/ajan/bridge_noskills.go; the noskillsfx call sites in pkg/ajan/noskillsserverfx/specs.go). On the TS side: the command dispatch (main.ts, module.ts, commands/spec.ts:166), every command's header and flags, and in full state/machine.ts, state/persistence.ts, the compile entry and output types in context/compiler.ts, commands/approve.ts, spec.ts specNew, next.ts main and the invoke-hook dispatcher; the rest mapped from its exports. The TS CLI was run in a scratch dir. Paths are relative to pkg/@eserstack/noskills/ (TS) and pkg/ajan/noskillsfx/ (Go). "Closed by" follows each M4 task's written scope; the rows no M4 task named were filed as TASK-258.1, TASK-259.1 and TASK-260.1.

| Area | TS | Go | Gap | Closed by |
|---|---|---|---|---|
| CLI entry and command tree | main.ts, module.ts (29 commands + mgr), commands/spec.ts:166 (14 spec subcommands) | none (3 FFI entry points in bridge_noskills.go; noskillsserverfx HTTP) | No Go CLI: parsing, help, exit codes, routing | TASK-257 |
| Output formats and modes | output/formatter.ts:19 (-o json/markdown/text, json default), output/mode.ts (--agent/--human), output/cmd.ts | compile.go commandPrefixOrDefault; bridge JSON only | No markdown or text renderers, no -o, no agent/human mode; prefix fallback matches | TASK-258.1 |
| Generated hook commands | sync/hook-commands.ts:39,52 (per-event timeouts, user hook merge, network-runner warning) | schema.go DefaultCommandPrefix only | No hook-command generation | TASK-257 |
| invoke-hook pre-tool-use and tool-call normalization | invoke-hook.ts:671 decidePreToolUse, :185 preToolUseAnswer (claude, kiro, copilot dialects, exit 2); hook-decisions.ts:84-346 toolCallOf (Claude Code, Codex, Copilot CLI, Kiro, OpenCode), :903 fileEditVerdict, :429 protectedFileAt, :560 changesNoskillsSection | none (helpers in concern_scope.go, concerns.go) | Phase gate, protected-file guard, tier-2 injection and dialect output missing | TASK-257 |
| invoke-hook stop, iterations | invoke-hook.ts:732; state/iteration.ts:199 recordIteration, :54 isDriverAuthoritative, :296 setDriver; hook-decisions.ts:1147 restartNotice | none | No iteration increment, no driver=acp stand-down, no restart notice | TASK-257 |
| post-file-write, post-bash, session-start | invoke-hook.ts:804, :824 (files-changed.jsonl, noskills-calls.jsonl), :852 session-start | none | Logs never written; no session-start instruction | TASK-257 |
| Ask token | invoke-hook.ts:990; state/ask-token.ts (30-minute TTL); next.ts:383 consumeAskTokens | persistence.go AskTokenFile constant only | Token never written or consumed | TASK-257 (hook), TASK-258 (next) |
| Git guard and agent-session wrapper | commands/git-wrapper.ts, git-wrapper-install.ts, invoke-hook.ts:947 git-exec, pkg/@eserstack/agents/guards/git.ts (597 lines) | none | Missing (git-wrapper-install.ts is imported by invoke-hook and run) | TASK-257 |
| init and detection | commands/init.ts (--non-interactive, --concerns, --tools, concern copy, syncAll, IDLE output); detect/codebase.ts, detect/tools.ts | bridge_noskills.go bridgeNoskillsInit (scaffold and manifest only) | No detection, tool sync or concern copy; returns {root}; providers [] where TS writes [claude-code]; overwrites .eser/.gitignore | TASK-258 (tool files via TASK-259) |
| spec new | spec.ts:307 (slug, --name, --from-plan, reserved names, branch spec/<name>, per-spec state, recordTransition, spec-created event, fails if it exists) | bridgeNoskillsSpecNew; noskillsserverfx/specs.go:64 | Go runs StartSpec on the global state, uses the current branch, auto-suffixes a taken name, stores an absolute path, writes no per-spec file, transition or event | TASK-258 |
| spec list, spec <name> | spec.ts:589; status.ts | noskillsserverfx/specs.go:21 (HTTP only) | No CLI | TASK-258.1 |
| spec split, revisit, ac, task, note | spec.ts:707, :872, :994, :1084, :1180; state/split.ts; context/split-detector.ts | none (types in schema.go) | Missing | TASK-258.1 |
| status | commands/status.ts | none | Missing | TASK-258 |
| next without an answer | next.ts:80 (resolveState, spec dir check, lastCalledAt on every call, session phase, idle context, validation, -o) | bridgeNoskillsNext; compile.go:28 | lastCalledAt only on answers; no session update, SpecNotFoundError or idle context | TASK-258 |
| next --answer | next.ts:960 handleAnswer (DISCOVERY listen, mode, premises, JSON batch; :728 refinement; SPEC_PROPOSAL classification; SPEC_APPROVED start; :1378 status report, :1744 verifyCommand, debt; BLOCKED unblock) | noskillsBridgeApplyAnswer; discovery.go:116 (not called by the bridge) | First DISCOVERY answer taken as the mode; raw EXECUTING answer stored; generic agent-answer decisions elsewhere | TASK-258 |
| Discovery stages | questions.ts:215 discoveryStageOf; compiler.ts:2116 compileDiscovery | discovery.go:254 (questions stage only) | No listen, mode and premise stages; one instruction for both audiences | TASK-258 (TASK-166 flow) |
| Discovery questions and parsing | questions.ts:29, :106, :162 | questions.go, discovery.go:65 | none (to be confirmed by the golden replay) | n/a |
| Discovery answer storage | machine.ts:191 addDiscoveryAnswer (20-char minimum, phase check, replace same question, user, email, timestamp, type) | machine.go AddDiscoveryAnswer | Appends unattributed answers, no checks; a TS state written back loses fields | TASK-258 |
| Follow-ups | commands/followup.ts; machine.ts:868-965; question-similarity.ts | discovery.go PendingFollowUps | Cannot add, answer or skip; no similarity check | TASK-258 (TASK-166) |
| Delegations | commands/review.ts, delegate.ts; machine.ts:967-1019; approve gate | schema.go type only | Missing; approve does not block on pending delegations | TASK-258.1 |
| Transition table | machine.ts:19 | machine.go:13 | none | n/a |
| Completing discovery | machine.ts:262 completeDiscovery (to DISCOVERY_REFINEMENT, spec path, draft, follow-up gate) | machine.go:131 (sets completed only) | Go never leaves DISCOVERY | TASK-258 |
| Approving the discovery review | machine.ts:323 (to SPEC_PROPOSAL, completeness gate, auto-classification) | machine.go:141 (DISCOVERY to DISCOVERY_REFINEMENT) | Different meaning; a server approve in DISCOVERY_REFINEMENT loops | TASK-258 |
| Execution, reopen, revisit, reset | machine.ts:408, :436, :454, :493, :534, :1027 | machine.go StartExecution, AdvanceExecution, BlockExecution, ReopenSpec, ResetToIdle | Old execution kept; no phase check; no block reason; reopenedFrom differs; no revisit; reset only from COMPLETED | TASK-258 |
| Refinement and extras | machine.ts:115-190, :643, :678 recordTransition, :702-783, :795-851 | machine.go SetCompletenessScore, SetReviewPosture, AddConfidenceFinding | About 25 transitions missing; transitionHistory never written | TASK-258 |
| approve | commands/approve.ts | noskillsserverfx/specs.go:261 (HTTP) | No CLI, no spec regeneration; the server moves SPEC_APPROVED to EXECUTING on approve | TASK-258 |
| done, cancel, wontfix | done.ts, cancel.ts, wontfix.ts (terminal per-spec, IDLE global) | specs.go:297 actionDone; machine.go CompleteSpec | No CLI; the split write is not reproduced | done: TASK-258; cancel, wontfix: TASK-258.1 |
| block, reset, reopen, free | block.ts, reset.ts, reopen.ts, free.ts | specs.go:326; machine.go | No CLI | TASK-258.1 |
| Compiler envelope | compiler.ts:1357 compile (gate :1305, protocolGuide :1237, interactiveOptions, commandMap, toolHint, toolHintInstruction :1524, enforcement :1174) | compile.go:28; compiler.go:301 | Fields declared but never filled; no toolHintInstruction; tier-2 count covers concerns only | TASK-258 |
| Compiler JSON shape | nested transition {onComplete, onBlocked, iteration, onResolved} | flat fields | Not wire-compatible | TASK-258 |
| Compiler IDLE | compiler.ts:1720 compileIdle | compile.go | Lists specs from the cwd, all labelled IDLE; concerns from the project dir; activeRulesCount 0 | TASK-258 |
| Compiler DISCOVERY_REFINEMENT | compiler.ts:2580 | compile.go; compiler.go:791 | Partial | TASK-258 |
| Compiler SPEC_PROPOSAL, SPEC_APPROVED | compiler.ts:2725, :2794 | compile.go | Only specPath and a classification flag | TASK-258 |
| Compiler EXECUTING | compiler.ts:2986 (tasks, batches, ACs :2865, status report, debt, review gates, tensions) | compile.go | Iteration, onComplete, restart flag, verification and tier-1 reminders only | TASK-258 |
| Compiler BLOCKED, COMPLETED | compiler.ts:3338, :3349 | compile.go | COMPLETED has no learning prompt or stale-diagram check | TASK-258 |
| Behavioral and meta blocks | compiler.ts:719 buildBehavioral, :1174 buildMeta | compiler.go:556, :809 | No outOfScope, posture suggestion or enforcement | TASK-258 |
| Classification inference | compiler.ts:509, :572 | compiler.go:412, compile.go:318 | none | n/a |
| Transition validation | context/transition-validation.ts (:523, :673, validations/<spec>.json); commands/next-validation.ts | validation.go (core behind ValidationJudge) | No aifx judge, no record cache, not wired into next | TASK-258 |
| Living spec | spec/living.ts:680, :236, :457/:481, :582, :757, :815, :852, :523 | specgen.go | No answer write-back, N/A marking, reveal notices, metadata actions or snapshots | TASK-258 |
| Spec rendering, parsing, updating | spec/template.ts:206, :47; generator.ts; parser.ts; updater.ts | none | Missing; EXECUTING cannot find tasks | TASK-258 |
| Concern loading | context/concerns.ts:34, :105, :340, :366; persistence.ts:611 | concerns.go:21; concern_scope.go | Go aborts on a bad concern where TS warns; no defaults; no review dimensions | TASK-258 (loader), TASK-259 (defaults) |
| concern command | commands/concern.ts | none | Missing | TASK-259 |
| Embedded defaults | defaults/concerns (17), defaults/packs (security, typescript) | none (no go:embed) | Missing | TASK-259 |
| Rules engine, rule command | sync/engine.ts:71-232; commands/rule.ts; context/folder-rules.ts | none | Rules never loaded | TASK-259 (rule), TASK-257 (tier-2 in the hook) |
| learn | commands/learn.ts; dashboard/learnings.ts | none | Missing | TASK-259 |
| pack | commands/pack.ts; pack/registry.ts; pack/schema.ts | none | Missing | TASK-259 |
| purge | commands/purge.ts; state/purge-history.ts | none | Missing | TASK-259 |
| purge restore | commands/purge-restore.ts (list, latest, selective, --overwrite, re-sync) | none | Missing (TASK-167) | TASK-259 |
| Decision ledger | state/decision-ledger.ts (from persistence.ts:466); commands/ledger.ts | ledger.go (read-only); noskillsserverfx/specs.go:134 | Go transitions never reach the ledger; no CLI | TASK-259 (write hook in TASK-258's persistence) |
| Events log | dashboard/events.ts:52 appendEvent | persistence.go constants only | Go adds no events | TASK-258.1 |
| Sessions | persistence.ts:918-1066; commands/session.ts; manager/session-binding.ts | session.go | No pid or startedAt; omits a null spec; an auto mode TS never writes; no CLI | TASK-259.1 |
| User identity, config | state/identity.ts (:119 resolveUser); commands/config.ts | manifest.user or "unknown" | Never reads user.json or git identity | TASK-259.1 (resolveUser use in TASK-258) |
| State file format | persistence.ts:399, :466 (2-space JSON + newline, normalizeStateShape, corrupt-state fallback) | persistence.go json.MarshalIndent | No trailing newline, <>& escaped, unknown fields (execution.driver) dropped, corrupt file is an error, no normalization | TASK-258 |
| State resolution, project root | persistence.ts:314, :860, --spec=, :1129 (NOSKILLS_PROJECT_ROOT) | bridgeNoskillsNext; specs.go:355; persistence.go:590 | Different precedence, no spec dir check, NOSKILLS_PROJECT_ROOT ignored | TASK-258 (TASK-257 for hooks) |
| Legacy migration, scaffold | persistence.ts:676 migrateLegacyLayout, :796 scaffoldEserDir | persistence.go:614 (mkdir only) | No migration; no .gitignore | TASK-258.1 |
| Manifest handling | persistence.ts:539, :558 (comment-preserving), :1069; schema.ts:524 | persistence.go:220, :267, :427 | A manifest without the noskills key counts as initialized; header comment lost; no createInitialManifest | TASK-258 |
| Sync engine and adapters | sync/engine.ts:308, :254; adapters for claude-code, cursor, windsurf, copilot, kiro, opencode, codex, copilot-cli; shared/* (3,679 lines) | compiler.go hints only | No file generation for any tool | TASK-259 |
| sync command | commands/sync.ts (redirects to init) | none | Missing | TASK-259 |
| validate | commands/validate.ts | specgen.go CheckSpecCompleteness | No CLI | TASK-258.1 |
| plan-export | commands/plan-export.ts | none | Missing | TASK-258.1 |
| diagrams | commands/diagrams.ts; dashboard/diagrams.ts | none | Missing | TASK-259.1 |
| watch | commands/watch.ts | none | Missing | TASK-260.1 |
| run | commands/run.ts (Ralph loop, ACP, autoCommit, driver=acp) | none (noskillsserverfx ACP workers differ) | Missing | TASK-260 |
| manager, mgr, web | commands/manager.ts, web.ts | none | No Go version | TASK-260 (forward), TASK-266 (M5) |
| Distribution, FFI client | scripts/npm-build.ts, bin-main.ts, go-noskills.ts | bridge_noskills.go | No binary, archives or launchers | TASK-261, TASK-262 |

Largest gaps: (1) no cmd/noskills and no hook path: about 3,100 TS lines (invoke-hook, hook-decisions, git wrappers, agents/guards/git.ts) with no Go counterpart (TASK-257); (2) the state machine disagrees: Go CompleteDiscovery never leaves DISCOVERY and ApproveDiscoveryReview makes the hop TS makes in completeDiscovery, so the same commands end in different phases (TASK-258); (3) Go writes lose data and are not byte-identical (answer attribution, execution.driver, no trailing newline, HTML escapes, no ledger or events) (TASK-258, TASK-259); (4) the compiler covers a fraction of the output (about 1,250 Go lines against 3,405) and its JSON shape differs (TASK-258); (5) next --answer is a stub in Go (TASK-258); (6) the 8 sync adapters (3,679 lines) have no Go code (TASK-259); (7) the spec lifecycle stops after the initial spec.md: no renderer, parser, task tracking or write-back (TASK-258); (8) purge, restore, pack, learn, rule, concern and the embedded defaults are absent (TASK-259); (9) about 20 behaviors belonged to no M4 task and are now TASK-258.1, TASK-259.1 and TASK-260.1; (10) noskills run has no Go version (TASK-260).

Line counts (wc -l, non-test source): TS pkg/@eserstack/noskills 33,287 (commands 13,638; context 5,401; state 5,104; sync 3,679; spec 1,596; dashboard 1,314; output 589; pack 549; manager 427; detect 230; scripts 209; defaults 133; root 418; compiler.ts 3,405; tests 30,901 more; agents/guards/git.ts adds 597). Go pkg/ajan/noskillsfx 5,497 (8,111 with tests; compiler.go 849, compile.go 405); bridge_noskills.go 374. noskillsserverfx (6,538) consumes noskillsfx and is not counted as the twin.

## Golden harness

pkg/ajan/noskillsfx/golden/golden_test.go (a test-only package) defines four scenarios, each run in a fresh fixture project (package.json, git init, a temporary HOME, NO_COLOR):
- spec_lifecycle: init, spec new "add a login page", spec add-login-page next, next --answer, next, status, spec list;
- hooks: init, spec new, invoke-hook pre-tool-use with Claude Code payloads for a Bash git push (deny, exit 2), a Write and a Read, invoke-hook session-start;
- purge_restore: init, spec new, purge --force, purge restore (list), purge restore latest, spec list;
- sync: init and sync with .claude, .cursor and .kiro present.
Each step records the exit code, stdout and every file of the project afterwards, normalized (project and home paths, ISO times, purge-history time ids, UUIDs, git object ids, epoch milliseconds, ANSI codes). NOSKILLS_GOLDEN_RECORD=1 runs the TS CLI (node pkg/@eserstack/noskills/main.ts), twice, and fails when the two runs differ (that is how the purge-history id was found and normalized), then writes testdata/golden/<scenario>.json (recorded with Node 26.12.1). In make test, TestRecordingsComplete checks every scenario has one golden per defined step, and TestReplay builds cmd/noskills and compares exit codes, stdout and files step by step; it is skipped while cmd/noskills does not exist (TASK-257). NOSKILLS_GOLDEN_DEBUG_DIR keeps both runs of a differing scenario.

Side finding: `noskills spec --help` takes --help for a spec name and crashes with an uncaught SpecNotFoundError stack trace (commands/spec.ts:257 -> status.ts:50 -> persistence.ts:328). Left alone here; the Go port should answer --help.

make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
