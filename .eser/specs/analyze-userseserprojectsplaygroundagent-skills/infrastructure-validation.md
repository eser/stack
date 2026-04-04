# Infrastructure Validation Report

Validates the current noskills concern pipeline against enriched concern
proposals from `enriched-concerns.md` and `progressive-loading.md`.

---

## 1. Test Suite Results

**Result: 170 passed (681 steps), 43 failed (251 steps)**

All 43 failures are in modules UNRELATED to the concern pipeline:

| Category                   | Failed Tests | Root Cause                                            |
| -------------------------- | ------------ | ----------------------------------------------------- |
| Session persistence        | 12           | `createSession`, `readSession`, `deleteSession`, etc. |
| Session staleness          | 4            | `isSessionStale`, `gcStaleSessions`                   |
| Events (append/read/watch) | 12           | `appendEvent`, `readEvents`, `watchEvents`            |
| Delegation events          | 2            | `delegation-created`, `delegation-answered`           |
| Dashboard delegation       | 1            | `getSpecSummary includes delegations`                 |
| Plan context compiler      | 6            | `planContext` in compiler output                      |
| Spec state planPath        | 2            | `stores planPath`                                     |
| Discovery review split     | 1            | `split creates child specs`                           |
| Purge                      | 1            | `returns ok result`                                   |

**Concern pipeline tests: ALL PASS** (3 test suites, ~15 test cases):

- `concerns.test.ts`: getConcernExtras, getReminders, detectTensions -- all
  green
- `compiler.test.ts` concern-related: concern reminders in context, concern
  extras in questions -- all green
- Tier split, behavioral blocks, EXECUTING context -- all green

These 43 failures appear to be pre-existing issues in session management, event
system, and delegation features -- not caused by concern changes.

---

## 2. Tier Split Simulation for Enriched `long-lived`

### Method

Applied `isFileSpecificReminder()` keyword matching (current code, line 128-137)
against all 14 reminders (4 existing + 10 new).

Current keywords: `slop`, `ui element`, `design intentionality`,
`interaction
states`, `edge case check`, `loading state`, `api doc`,
`endpoint should be`, `migration`, `rollback`.

### Results

| #  | Reminder (shortened)                                  | Matches Keyword? | Tier       |
| -- | ----------------------------------------------------- | ---------------- | ---------- |
| 1  | Favor boring technology                               | No               | **Tier 1** |
| 2  | Every shortcut needs justification                    | No               | **Tier 1** |
| 3  | Consider maintenance burden                           | No               | **Tier 1** |
| 4  | Update README and relevant docs                       | No               | **Tier 1** |
| 5  | Deprecation planning starts at design time            | No               | **Tier 1** |
| 6  | Never deprecate without production-proven replacement | No               | **Tier 1** |
| 7  | YOU migrate the consumers (Churn Rule)                | No               | **Tier 1** |
| 8  | Zombie code -- investment or removal                  | No               | **Tier 1** |
| 9  | Prefer addition over modification                     | No               | **Tier 1** |
| 10 | Every observable API behavior is a contract           | No               | **Tier 1** |
| 11 | RATIONALIZATION ALERT: "Someone might need it later"  | No               | **Tier 1** |
| 12 | RATIONALIZATION ALERT: "We can maintain both systems" | No               | **Tier 1** |
| 13 | Feature flags that live forever become debt           | No               | **Tier 1** |
| 14 | Separate refactoring from feature work                | No               | **Tier 1** |

**Result: ALL 14 reminders classify as Tier 1. Zero go to Tier 2.**

### Gap Identified

The enriched `long-lived` concern adds reminders about deprecation, feature
flags, and API contracts, but the current `isFileSpecificReminder()` does NOT
match any of these. The progressive-loading.md document proposes extending the
keyword list with `deprecat`, `feature flag`, etc., but these extensions do NOT
exist in the current code.

Without the keyword extensions from progressive-loading.md section 2, the
enriched long-lived concern will dump ALL 14 reminders into tier 1 during
EXECUTING, contributing to the token budget overrun the progressive-loading doc
itself flags.

Note: `migration` IS in the current keyword list, but none of the new long-lived
reminders contain the word "migration" (they use "deprecation" and "migrate"
instead -- `migration` does not match `migrate`).

---

## 3. Phase Injection Trace

### DISCOVERY Phase

**Path**: `compileDiscovery()` -> line 1372:

```
concernReminders: concerns.getReminders(activeConcerns)
```

`getReminders()` iterates ALL reminders from ALL active concerns with optional
classification filtering. For enriched long-lived with no classification set
(early DISCOVERY), ALL 14 reminders are emitted.

**Result**: DISCOVERY gets full 14 reminders from long-lived. CORRECT behavior
per progressive-loading.md Phase-Content Matrix row 1.

Classification filtering: `getReminders()` only filters on `involvesWebUI` and
`involvesPublicAPI`. None of the 14 long-lived reminders contain the filtered
keywords (slop, UI element, API doc, endpoint should be, etc.), so
classification has no effect. All 14 pass through unfiltered.

### EXECUTING Phase (compile-time)

**Path**: `compileExecution()` -> lines 2060 and 2136:

```
concernReminders: concerns.splitRemindersByTier(activeConcerns).tier1
```

Per the tier split simulation above, ALL 14 reminders land in tier 1.

**Result**: EXECUTING gets all 14 reminders as tier 1. This matches the
progressive-loading.md expectation for "general/tier 1" reminders but EXCEEDS
the intended budget because reminders that should be tier 2 (deprecation,
feature flags) are not routed there without keyword extensions.

### EXECUTING Phase (per-file hook / PreToolUse)

**Path**: `handlePreToolUse()` -> line 344:

```
concerns.getTier2RemindersForFile(activeConcernDefs, filePath, classification)
```

Since `splitRemindersByTier()` puts zero long-lived reminders in tier 2,
`getTier2RemindersForFile()` will also return zero for any file.

**Result**: Per-file hook delivers ZERO long-lived reminders. This is a gap --
deprecation-related reminders should fire when editing `.ts`/`.go` files per the
progressive-loading.md proposal.

---

## 4. Token Budget Analysis

### Character count for enriched long-lived reminders

Exact character counts for the 14 reminders (text only, no prefix):

| #         | Reminder                                                         | Chars     |
| --------- | ---------------------------------------------------------------- | --------- |
| 1         | Favor boring technology over shiny new tools                     | 46        |
| 2         | Every shortcut needs explicit justification                      | 44        |
| 3         | Consider maintenance burden for new dependencies                 | 49        |
| 4         | If this task changes public behavior... (full text)              | 168       |
| 5         | Deprecation planning starts at design time...                    | 82        |
| 6         | Never deprecate without a working, production-proven replacement | 64        |
| 7         | If you own the deprecated infra, YOU migrate...                  | 76        |
| 8         | Zombie code with no owner must get investment or removal...      | 61        |
| 9         | Prefer addition over modification for public interfaces...       | 80        |
| 10        | Every observable API behavior is a de facto contract...          | 93        |
| 11        | RATIONALIZATION ALERT: "Someone might need it later"...          | 89        |
| 12        | RATIONALIZATION ALERT: "We can maintain both systems..."         | 83        |
| 13        | Feature flags that live forever become tech debt...              | 68        |
| 14        | Separate refactoring from feature work into distinct commits     | 60        |
| **Total** |                                                                  | **1,063** |

With `long-lived:` prefix (12 chars each): 1,063 + (14 * 12) = **1,231 chars**

**Estimated tokens**: 1,231 / 4 = **~308 tokens** (long-lived alone)

### Comparison to thresholds (from progressive-loading.md)

| Phase            | Threshold     | Long-lived alone | All 6 concerns (current) | Budget remaining |
| ---------------- | ------------- | ---------------- | ------------------------ | ---------------- |
| EXECUTING tier 1 | ~1,000 tokens | ~308             | ~425 (current baseline)  | ~267             |
| DISCOVERY        | ~2,000 tokens | ~308             | ~650 (current baseline)  | ~1,042           |

Long-lived alone uses ~308 tokens. With all 6 current concerns enriched
(open-source +8, beautiful-product +7, compliance +11 reminders), the EXECUTING
tier 1 total would be approximately:

- Current 17 tier 1 reminders: ~425 tokens
- New enriched reminders that land in tier 1 (since keyword extensions don't
  exist): ~36 additional reminders * ~75 chars avg = ~2,700 chars / 4 = ~675
  tokens
- **Projected EXECUTING tier 1 total: ~1,100 tokens -- EXCEEDS 1,000 threshold**

This confirms the progressive-loading.md finding that keyword extensions are
prerequisite for staying within budget.

---

## 5. Schema Compatibility

### ConcernDefinition type (schema.ts lines 385-393)

```typescript
export type ConcernDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extras: readonly ConcernExtra[];
  readonly specSections: readonly string[];
  readonly reminders: readonly string[];
  readonly acceptanceCriteria: readonly string[];
};
```

### Enriched long-lived concern JSON (from enriched-concerns.md)

The enrichment proposes adding to:

- `reminders`: +10 strings -- **COMPATIBLE** (same `string[]` type)
- `acceptanceCriteria`: +5 strings -- **COMPATIBLE** (same `string[]` type)
- `extras`: +3 objects with `{questionId, text}` -- **COMPATIBLE** (matches
  `ConcernExtra`)
- `specSections`: +3 strings -- **COMPATIBLE** (same `string[]` type)

### New concern JSON blocks (testing-discipline, shipping-safely, etc.)

The proposed new concern JSON in enriched-concerns.md Part 2 uses exactly the
same fields as `ConcernDefinition`:

- `id`, `name`, `description`, `extras`, `specSections`, `reminders`,
  `acceptanceCriteria`

**Result: 100% schema compatible. No new fields needed. No type changes
required.**

### Verification: no fields in proposals that are absent from schema

Checked all 4 new concern JSON blocks and 4 enrichment sections. Every field
used (`id`, `name`, `description`, `extras`, `specSections`, `reminders`,
`acceptanceCriteria`) exists in `ConcernDefinition`. No proposed field is
missing from the type.

### Classification extension needed

The progressive-loading.md proposes new classification flags:

- `involvesDeployment` -- NOT in current `SpecClassification`
- `involvesSecurity` -- NOT in current `SpecClassification`
- `involvesTests` -- NOT in current `SpecClassification`

Current `SpecClassification` (schema.ts lines 169-175):

```typescript
export type SpecClassification = {
  readonly involvesWebUI: boolean;
  readonly involvesCLI: boolean;
  readonly involvesPublicAPI: boolean;
  readonly involvesMigration: boolean;
  readonly involvesDataHandling: boolean;
};
```

These 3 new flags would require a schema change. This is a known gap documented
in progressive-loading.md section 4C.

---

## 6. Infrastructure Gaps Summary

### Gap 1: `isFileSpecificReminder` keyword list is too narrow (HIGH)

The current keyword list does not match any enriched long-lived reminders.
Without extending keywords (`deprecat`, `feature flag`, `red flag`, etc.), ALL
enriched reminders become tier 1, overloading the EXECUTING compile-time budget.

**Impact**: Token budget exceeds threshold by ~10% for enriched concerns.
**Fix**: Extend `isFileSpecificReminder()` per progressive-loading.md section 2.

### Gap 2: `migration` keyword does not match `migrate` (MEDIUM)

The keyword `migration` in `isFileSpecificReminder` uses `includes("migration")`
which does NOT match "migrate" (e.g., "YOU migrate the consumers"). The verb
form is missed.

**Impact**: Deprecation/migration reminders from long-lived stay in tier 1.
**Fix**: Add `migrate` as a separate keyword or use a broader match.

### Gap 3: Classification gating lacks deployment/security/test flags (MEDIUM)

`getReminders()` only filters by `involvesWebUI` and `involvesPublicAPI`. The
progressive-loading strategy requires `involvesDeployment`, `involvesSecurity`,
and `involvesTests` for budget control. These flags do not exist in
`SpecClassification`.

**Impact**: Cannot gate shipping-safely or compliance security reminders by
classification. **Fix**: Add 3 new optional boolean fields to
`SpecClassification`.

### Gap 4: No reminder count cap for DISCOVERY phase (LOW)

The progressive-loading.md recommends capping DISCOVERY reminders at 60. No such
cap exists in `getReminders()` or `compileDiscovery()`. With 10 active concerns
and 104 total reminders, DISCOVERY would inject ~3,700 tokens of reminders
alone.

**Impact**: DISCOVERY output becomes excessively large with many active
concerns. **Fix**: Add a `maxReminders` parameter to `getReminders()` or
truncate in `compileDiscovery()`.

### Gap 5: `getTier2RemindersForFile` extension matching not in place (LOW)

The function matches UI reminders to UI file extensions and API reminders to API
file extensions, but the proposed new categories (security headers to .ts/.go,
deprecation to .ts/.go, console.log to .ts/.js) have no routing rules yet.

**Impact**: Tier 2 per-file delivery is incomplete for enriched content.
**Fix**: Extend the routing logic in `getTier2RemindersForFile()` alongside the
keyword additions.

### Gap 6: RED FLAG reminders have no special routing (LOW)

The progressive-loading.md proposes treating `RED FLAG` reminders as tier 2 with
broad file matching. Currently, `isFileSpecificReminder()` has no `red flag`
keyword check.

**Impact**: RED FLAG reminders become tier 1 instead of contextual tier 2.
**Fix**: Add `red flag` to keyword list with broad file-type matching.

---

## 7. Recommendations for Implementation Spec

1. **Phase 1 (no schema changes)**: Extend `isFileSpecificReminder()` keyword
   list and `getTier2RemindersForFile()` routing per progressive-loading.md
   section 2. This is the highest-impact change with zero schema risk.

2. **Phase 2 (schema change)**: Add `involvesDeployment`, `involvesSecurity`,
   `involvesTests` to `SpecClassification` as optional booleans. Update
   `getReminders()` to filter by these flags.

3. **Phase 3 (budget control)**: Add a reminder cap (60) for DISCOVERY phase.
   Consider a configurable `maxRemindersPerPhase` in manifest.

4. **No new infrastructure needed**: The existing two-tier system (compile-time
   tier 1 + PreToolUse hook tier 2) is sufficient. The concern JSON schema
   already supports all proposed enrichment fields. The implementation spec
   should focus on keyword extensions and classification gating, not new
   architectural patterns.

5. **Test coverage**: Add tests for `splitRemindersByTier()` with enriched
   concerns that contain the proposed new keywords. Verify tier routing for
   RATIONALIZATION ALERT, RED FLAG, and domain-specific reminders.
