# Spec: discovery-integrity-system-enforce

## Status: completed

## Concerns: long-lived, beautiful-product, open-source

## Discovery Answers

### status_quo

(a) [STATED] Agent can answer Q1-Q6, mode selection, premise challenge, and
approval autonomously without asking the user via AskUserQuestion. No
per-question proof of consent exists. (b) [CONFIRMED after grep] The only
existing mechanical check is Jidoka C1 batchSubmitted flag in state/schema.ts
line 147, which detects when multiple answers arrive in one JSON submission but
does NOT verify individual questions were asked. (c) [STATED] Listen-first is
currently a separate step before mode selection; users cannot iteratively add
context — once they submit context once they move to mode selection. (d)
[STATED] After discovery, classification is a separate mechanical step with 5
booleans (involvesWebUI/CLI/PublicAPI/Migration/DataHandling) before
SPEC_PROPOSAL. Pain: interruptive, mechanical, and most answers are already
derivable from discovery text.

_-- Eser Ozvataf_

### ambition

1-star: tokens exist mechanically, STATED/INFERRED persisted per-answer,
REFINEMENT shows a wall of warning icons, classification auto-inferred — but the
display feels accusatory (AGENT CHEATED energy), noisy, and the user resents the
oversight. 10-star: invisible trust. User never sees
.eser/.state/ask-token.json. REFINEMENT display is calm prose: a single-line
note 'I pre-filled 3 items from your spec body. Confirm each.' with a subtle
inline confirmation UI — no warning icons unless something is genuinely
problematic (like modified-question detection). No icon-in-circle grids, no
colored borders, no decorative badges (AI-slop blacklist compliance). Option (a)
recursive context-sharing feels like brainstorming with the agent, not a form.
Auto-classification is silently correct >90% of the time — user only sees the
classification question when it matters. Emotional response: user trusts
noskills MORE because they know it can't be gamed. The rigor removes anxiety
rather than adding it. Design intentionality target: 8/10.

_-- Eser Ozvataf_

### reversibility

(a) Technical reversibility HIGH: hook subcommand (post-ask-user-question) is
additive, token file is ephemeral (single-use, 30-min expiry, no durable state),
classification field additions are non-breaking ADDITIVE changes to
SpecClassification. (b) UX reversibility MEDIUM: once users get used to merged
listen-first+mode entry with recursive option (a), reverting to two-step flow
feels regressive. Habit formation is the sticky layer. (c) The only true one-way
door is the userContext string->string[] state migration — once old state files
are migrated to array form, rollback requires re-migration (array->string with
separator). Mitigation: the persistence.migration.test.ts pattern already exists
for this exact scenario. (d) Still correct in 2 years? Per-tool confirmation
tokens are a durable primitive (aligns with capability-based security).
Regex-based auto-classification WILL drift as vocabulary changes, but the
REFINEMENT confirmation is the safety net: regex is a suggestion layer, not
source of truth. Acceptable 2-year outlook.

_-- Eser Ozvataf_

### user_impact

Impact across 4 populations: (a) In-flight spec state files with
userContext:string need migration to userContext:string[]. Users hit migration
on next noskills command — transparent if persistence.migration handles it. (b)
Cursor/Windsurf users (behavioral platforms without PostToolUse hook support)
see all answers default INFERRED and get MORE REFINEMENT confirmations than
before. Net positive for trust but more clicks. Should be noted in release
communication. (c) Contributors adding new platform adapters now need to
implement post-ask-user-question hook for full trust. Integration bar is higher.
Mitigation: behavioral fallback works without it — opt-in improvement, not
mandatory. (d) First-time users see the merged entry menu (one step) instead of
two-step listen-first+mode flow. Simpler, no learning curve. (e) Existing users
who remember the 5-boolean classification step find it gone from SPEC_DRAFT
phase — they now see inferred classification at REFINEMENT for confirmation.
Potential surprise, should be mentioned in release notes. Per open-source
concern: new hook subcommand MUST be documented in
pkg/@eser/noskills/README-HOW.md in the SAME PR (long-lived concern:
'Documentation is not a follow-up').

_-- Eser Ozvataf_

### verification

Test strategy: (a) Token system
(pkg/@eser/noskills/commands/invoke-hook.test.ts + next.test.ts): hook writes
token on AskUserQuestion call; answer with valid token -> STATED; wrong stepId
-> INFERRED; wrong spec -> INFERRED; expired (>30min) -> INFERRED; single-use
deletion after consumption; modified question detection when similarity <0.7 ->
match:modified; race condition with two AskUserQuestion calls before noskills
next (second overwrites first, documented behavior). (b) Listen-first merged
entry (pkg/@eser/noskills/state/machine.test.ts): option (a) appends to
userContext[], multiple (a) selections accumulate entries in order, b/c/d
advances to premise challenge, rich description (>500 chars) recommends mode not
context, userContext pre-fills discovery answers as INFERRED. (c)
Auto-classification (pkg/@eser/noskills/context/compiler.test.ts): regex detects
Web UI/CLI/API/Migration/Data keywords per category, empty text -> all false,
REFINEMENT confirmation flow preserves user overrides, inferredFrom field
populated. (d) Migration
(pkg/@eser/noskills/state/persistence.migration.test.ts): legacy
userContext:string -> userContext:[string] upgrade, legacy state files with no
source field load as STATED, legacy classifications without source field load as
confirmed. Documentation: pkg/@eser/noskills/README-HOW.md updated with token
system description + new hook subcommand; pkg/@eser/noskills/README.md updated
with merged entry flow + auto-classification; release notes mention
Cursor/Windsurf behavior change. Success metrics: (1) agents CANNOT submit
STATED answer without having called AskUserQuestion for that step
(hook-enforced, verified by test); (2) UI design intentionality rating for
REFINEMENT display >=7/10 per beautiful-product concern; (3) new contributor can
understand token flow in <30 min by reading invoke-hook.ts + next.ts +
README-HOW.md. Target: 20+ new tests (baseline already in spec body plus
race/failure/isolation additions).

_-- Eser Ozvataf_

### scope_boundary

Explicit non-goals: (a) Do NOT change the AskUserQuestion tool itself, discovery
question content (Q1-Q6), concern injection, spec generation, or existing
STATED/INFERRED marking in compiler.ts — reuse, do not reinvent. (c) Do NOT
block behavioral platforms (Cursor/Windsurf) without PostToolUse hook support —
all-INFERRED fallback is mandatory and correct. Platforms without hooks still
work. (d) Do NOT persist tokens beyond single-question lifecycle — no audit log,
no history, no analytics. Tokens are ephemeral: written by hook, consumed by
next, deleted immediately. (e) Do NOT use ML classification — regex only per
long-lived concern ('favor boring technology'). If regex drifts, the REFINEMENT
confirmation catches it. ML is explicitly out of scope, not deferred. (f) Do NOT
rename existing phases or state fields. Only ADD fields: source and inferredFrom
on SpecClassification, userContextEntries or migrated userContext. Additive-only
schema change. (g) Do NOT auto-advance through discovery even if answers are
pre-filled from rich context — each answer still requires per-question
confirmation via AskUserQuestion. The token system is the mechanism, not an
escape. (h) Do NOT allow cross-spec token usage — tokens are validated against
activeSpec and stepId. A token from spec A cannot be consumed by spec B.
CORRECTION from user: anti-cheat IS a goal. If agents find workarounds, patching
them is the point — mechanical enforcement must stay tight. Document workarounds
only as known-issues during the fix window, not as permanent carve-outs.
Technical debt introduced: (1) one more ephemeral state file format
(ask-token.json) adds a minor cognitive load; (2) invoke-hook.ts grows by ~50
lines (currently ~680); (3) state schema version bump required for userContext
migration.

_-- Eser Ozvataf_

## Error Recovery (long-lived)

_To be addressed during execution._

## Deployment Plan (long-lived)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Error & Rescue Registry (long-lived)

_For every new codepath: what can go wrong? Build a table: Method/Codepath |
What Can Go Wrong | Exception Class | Rescued? | Recovery Action | User Sees.
Flag any row where Rescued=No or User Sees=raw error._

| Codepath                                             | What Can Go Wrong             | Exception Class | Rescued?                           | Recovery Action                                    | User Sees                                    |
| ---------------------------------------------------- | ----------------------------- | --------------- | ---------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| invoke-hook.ts handlePostAskUserQuestion token write | Disk full / permission denied | IOError         | YES (outer try/catch)              | Skip write, hook exits silently                    | Nothing; answer defaults to INFERRED at next |
| next.ts consumeAskToken read                         | File not found (ENOENT)       | —               | YES                                | source=INFERRED, questionMatch=not-asked           | Normal REFINEMENT confirmation               |
| next.ts consumeAskToken read                         | Malformed JSON                | SyntaxError     | YES (catch)                        | source=INFERRED                                    | Normal flow                                  |
| next.ts consumeAskToken delete                       | Permission error              | IOError         | YES (inner try/catch, best-effort) | Leave file; 30-min expiry will reject next attempt | No impact                                    |
| compiler.ts inferClassification                      | Null userContext array        | —               | Guard via `?? []`                  | Returns all-false classification                   | Empty inferredFrom                           |
| persistence.ts normalizeStateShape                   | Legacy `userContext:string`   | —               | Detect via typeof, wrap in array   | Legacy state loads cleanly                         | Transparent migration                        |
| persistence.ts normalizeStateShape                   | userContext is null           | —               | Safe fallback to undefined         | Fresh state initialization                         | Normal flow                                  |
| machine.ts autoClassifyIfMissing                     | classification already set    | —               | Early return (no overwrite)        | Preserves manual classification                    | Manual choice respected                      |

## Failure Modes Analysis (long-lived)

_For every new codepath: Codepath | Failure Mode | Rescued? | Tested? | User
Sees | Logged? Flag CRITICAL gaps: unrescued + untested + silent failure. These
block ship._

| Codepath                                        | Failure Mode                    | Rescued?                  | Tested?                                  | User Sees                    | Logged?              |
| ----------------------------------------------- | ------------------------------- | ------------------------- | ---------------------------------------- | ---------------------------- | -------------------- |
| Token write (hook)                              | Disk full / permission          | YES                       | task-14 pending                          | Degrades to INFERRED at next | No (fire-and-forget) |
| Token read (next.ts)                            | File missing                    | YES                       | task-14 pending                          | INFERRED confirmation flow   | No                   |
| Race: two AskUserQuestion before next           | Second overwrites first         | YES (documented behavior) | task-14 pending                          | First answer marked INFERRED | No                   |
| Cross-spec token consumption                    | Spec mismatch rejected          | YES                       | task-14 pending                          | INFERRED                     | No                   |
| Behavioral platforms (Cursor/Windsurf, no hook) | No token ever written           | YES (design)              | task-14 pending                          | All answers default INFERRED | No                   |
| Expired token (>30 min)                         | Age check rejects               | YES                       | task-14 pending                          | INFERRED                     | No                   |
| Clock skew (ageMs < 0)                          | isFinite + negative guard       | YES                       | task-14 pending                          | INFERRED                     | No                   |
| Migration on missing userContext field          | normalizeStateShape initializes | YES                       | persistence.state-migration.test.ts PASS | Transparent                  | No                   |

**CRITICAL GAPS**: None. Every failure mode degrades to INFERRED, with
REFINEMENT confirmation as the final safety net.

## Decisions

| # | Decision                        | Choice                                                       | Promoted |
| - | ------------------------------- | ------------------------------------------------------------ | -------- |
| 1 | Split spec into separate areas? | Chose to keep as single spec despite multiple areas detected | no       |

## Out of Scope

- Explicit non-goals: (a) Do NOT change the AskUserQuestion tool itself,
  discovery question content (Q1-Q6), concern injection, spec generation, or
  existing STATED/INFERRED marking in compiler.ts — reuse, do not reinvent. (c)
  Do NOT block behavioral platforms (Cursor/Windsurf) without PostToolUse hook
  support — all-INFERRED fallback is mandatory and correct
- Platforms without hooks still work. (d) Do NOT persist tokens beyond
  single-question lifecycle — no audit log, no history, no analytics
- Tokens are ephemeral: written by hook, consumed by next, deleted immediately.
  (e) Do NOT use ML classification — regex only per long-lived concern ('favor
  boring technology')
- If regex drifts, the REFINEMENT confirmation catches it
- ML is explicitly out of scope, not deferred. (f) Do NOT rename existing phases
  or state fields
- Only ADD fields: source and inferredFrom on SpecClassification,
  userContextEntries or migrated userContext
- Additive-only schema change. (g) Do NOT auto-advance through discovery even if
  answers are pre-filled from rich context — each answer still requires
  per-question confirmation via AskUserQuestion
- The token system is the mechanism, not an escape. (h) Do NOT allow cross-spec
  token usage — tokens are validated against activeSpec and stepId
- A token from spec A cannot be consumed by spec B
- CORRECTION from user: anti-cheat IS a goal
- If agents find workarounds, patching them is the point — mechanical
  enforcement must stay tight
- Document workarounds only as known-issues during the fix window, not as
  permanent carve-outs
- Technical debt introduced: (1) one more ephemeral state file format
  (ask-token.json) adds a minor cognitive load
- (2) invoke-hook.ts grows by ~50 lines (currently ~680)
- (3) state schema version bump required for userContext migration.

## Tasks

- [x] task-1: Extend SpecClassification type in state/schema.ts with source
      (inferred|confirmed|manual) and inferredFrom (readonly string[]) fields.
      Additive only. Files: pkg/@eser/noskills/state/schema.ts |
- [x] task-2: Extend AttributedDiscoveryAnswer with source
      (STATED|INFERRED|CONFIRMED) and questionMatch (exact|modified|not-asked)
      fields. Legacy defaults to STATED. Files:
      pkg/@eser/noskills/state/schema.ts |
- [x] task-3: Migrate DiscoveryState.userContext from string to readonly
      string[] with backward-compat detection in persistence read. Add
      entryComplete flag. Files: pkg/@eser/noskills/state/schema.ts;
      pkg/@eser/noskills/state/persistence.ts;
      pkg/@eser/noskills/state/persistence.migration.test.ts |
- [x] task-4: Add askTokenFile entry to persistence.paths module so path is
      derived not hardcoded (coordinates with unify-noskills-runtime-directories
      spec). Files: pkg/@eser/noskills/state/persistence.ts |
- [x] task-5: Implement handlePostAskUserQuestion in invoke-hook.ts. Reads
      stdin; extracts toolInput.question; loads state; determines expected step
      id; computes similarity; writes JSON token to askTokenFile with
      token/stepId/spec/match/originalQuestion/askedQuestion/createdAt.
      Best-effort on IO failure. Files:
      pkg/@eser/noskills/commands/invoke-hook.ts |
- [x] task-6: Add compareQuestions similarity function using word-overlap
      Jaccard. No external deps. Threshold 0.7. Files:
      pkg/@eser/noskills/context/question-similarity.ts;
      pkg/@eser/noskills/context/question-similarity.test.ts |
- [x] task-7: Add token validation in commands/next.ts answer submission. Read
      token; validate spec+stepId+age (30min); set source STATED with match or
      INFERRED; single-use delete on success. Store source on
      AttributedDiscoveryAnswer. Files: pkg/@eser/noskills/commands/next.ts |
- [x] task-8: Add inferClassification function in context/compiler.ts. Regex
      over description+userContext+answers for 5 keyword categories. Returns
      SpecClassification with source=inferred and populated inferredFrom. Files:
      pkg/@eser/noskills/context/compiler.ts;
      pkg/@eser/noskills/context/compiler.test.ts |
- [x] task-9: Merge listen-first into mode-selection as DISCOVERY.entry subPhase
      in state machine. Recursive option (a) appends to userContext[]; option
      b/c/d sets mode and marks entryComplete; rich description >500 chars
      recommends mode not context. Files: pkg/@eser/noskills/state/machine.ts;
      pkg/@eser/noskills/state/discovery-features.test.ts |
- [x] task-10: Remove classification question step from SPEC_PROPOSAL phase.
      Classification is now auto-inferred during REFINEMENT with user
      confirmation. Files: pkg/@eser/noskills/state/machine.ts;
      pkg/@eser/noskills/commands/next.ts |
- [x] task-11: Add REFINEMENT classification confirmation UI in compiler.ts.
      Render inferred values with keyword evidence (no icon-in-circle; no
      colored borders; calm prose per beautiful-product). Allow toggle via
      AskUserQuestion. Files: pkg/@eser/noskills/context/compiler.ts |
- [x] task-12: Register post-ask-user-question hook in sync adapters for Claude
      Code and Codex. Behavioral platforms fall through (all INFERRED). Files:
      pkg/@eser/noskills/sync/hooks.ts; pkg/@eser/noskills/sync/claude.ts;
      pkg/@eser/noskills/sync/adapters/codex.ts |
- [x] task-13: Populate Error & Rescue Registry and Failure Modes Analysis
      tables in spec.md with real codepaths (token write; token read;
      inferClassification null guard; migration idempotency; race; cross-spec;
      behavioral fallback). Files:
      .eser/specs/discovery-integrity-system-enforce/spec.md |
- [x] task-14: Write 20+ tests covering token roundtrip; expiration; single-use;
      modified-question detection; race; cross-spec isolation; migration
      string->string[]; merged entry subPhase; auto-classification per category;
      legacy state compat. Files:
      pkg/@eser/noskills/commands/invoke-hook.test.ts;
      pkg/@eser/noskills/commands/next.test.ts;
      pkg/@eser/noskills/state/machine.test.ts;
      pkg/@eser/noskills/state/discovery-features.test.ts;
      pkg/@eser/noskills/state/persistence.migration.test.ts;
      pkg/@eser/noskills/context/compiler.test.ts;
      pkg/@eser/noskills/context/question-similarity.test.ts |
- [x] task-15: Update documentation in same PR: README-HOW.md with token
      system + new hook subcommand; README.md with merged entry flow +
      auto-classification; release notes with Cursor/Windsurf behavioral
      platform note. Files: pkg/@eser/noskills/README-HOW.md;
      pkg/@eser/noskills/README.md

## Verification

- Test strategy: (a) Token system
  (pkg/@eser/noskills/commands/invoke-hook.test.ts + next.test.ts): hook writes
  token on AskUserQuestion call
- answer with valid token -> STATED
- wrong stepId -> INFERRED
- wrong spec -> INFERRED
- expired (>30min) -> INFERRED
- single-use deletion after consumption
- modified question detection when similarity <0.7 -> match:modified
- race condition with two AskUserQuestion calls before noskills next (second
  overwrites first, documented behavior). (b) Listen-first merged entry
  (pkg/@eser/noskills/state/machine.test.ts): option (a) appends to
  userContext[], multiple (a) selections accumulate entries in order, b/c/d
  advances to premise challenge, rich description (>500 chars) recommends mode
  not context, userContext pre-fills discovery answers as INFERRED. (c)
  Auto-classification (pkg/@eser/noskills/context/compiler.test.ts): regex
  detects Web UI/CLI/API/Migration/Data keywords per category, empty text -> all
  false, REFINEMENT confirmation flow preserves user overrides, inferredFrom
  field populated. (d) Migration
  (pkg/@eser/noskills/state/persistence.migration.test.ts): legacy
  userContext:string -> userContext:[string] upgrade, legacy state files with no
  source field load as STATED, legacy classifications without source field load
  as confirmed
- Documentation: pkg/@eser/noskills/README-HOW.md updated with token system
  description + new hook subcommand
- pkg/@eser/noskills/README.md updated with merged entry flow +
  auto-classification
- release notes mention Cursor/Windsurf behavior change
- Success metrics: (1) agents CANNOT submit STATED answer without having called
  AskUserQuestion for that step (hook-enforced, verified by test)
- (2) UI design intentionality rating for REFINEMENT display >=7/10 per
  beautiful-product concern
- (3) new contributor can understand token flow in <30 min by reading
  invoke-hook.ts + next.ts + README-HOW.md
- Target: 20+ new tests (baseline already in spec body plus
  race/failure/isolation additions).

## Transition History

| From | To        | User         | Timestamp                | Reason |
| ---- | --------- | ------------ | ------------------------ | ------ |
| IDLE | DISCOVERY | Eser Ozvataf | 2026-04-06T06:13:19.302Z | -      |
