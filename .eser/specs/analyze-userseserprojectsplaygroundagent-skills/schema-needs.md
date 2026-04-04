# Concern Schema Extension Needs

Synthesized from: mapping.md, enriched-concerns.md, progressive-loading.md,
infrastructure-validation.md. References source line numbers in
`pkg/@eser/noskills/state/schema.ts` and
`pkg/@eser/noskills/context/concerns.ts`.

---

## 1. Current Schema Snapshot

### ConcernDefinition (schema.ts lines 385-393)

```typescript
export type ConcernDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extras: readonly ConcernExtra[]; // discovery questions
  readonly specSections: readonly string[]; // sections to inject in SPEC_DRAFT
  readonly reminders: readonly string[]; // tier-split behavioral nudges
  readonly acceptanceCriteria: readonly string[]; // gates for DONE
};
```

### ConcernExtra (schema.ts lines 380-383)

```typescript
export type ConcernExtra = {
  readonly questionId: string;
  readonly text: string;
};
```

### SpecClassification (schema.ts lines 169-175)

```typescript
export type SpecClassification = {
  readonly involvesWebUI: boolean;
  readonly involvesCLI: boolean;
  readonly involvesPublicAPI: boolean;
  readonly involvesMigration: boolean;
  readonly involvesDataHandling: boolean;
};
```

---

## 2. Proposed Optional Fields on ConcernDefinition

Three new fields were originally proposed: `rationalizations`, `redFlags`, and
`phaseContent`. After tracing how the infrastructure actually works, **none of
them are needed**.

### 2A. `rationalizations: readonly string[]` -- NOT NEEDED

**What it would store**: Dedicated array of "RATIONALIZATION ALERT: ..."
strings.

**Why it is unnecessary**: The enriched-concerns.md already embeds these as
regular `reminders[]` entries prefixed with `RATIONALIZATION ALERT:`. The
progressive-loading.md (section 2) routes them to tier 1 by keyword: the
existing `isFileSpecificReminder()` function returns `false` for them (no
file-type keywords), so they naturally land in tier 1 compile-time context.

The infrastructure-validation.md (section 2) confirms: all 14 enriched
long-lived reminders -- including the 2 RATIONALIZATION ALERTs -- correctly
classify as tier 1 with the current logic.

**Verdict**: The existing `reminders[]` field handles this. A dedicated field
would duplicate data and force the tier-split logic to merge two arrays.

### 2B. `redFlags: readonly string[]` -- NOT NEEDED

**What it would store**: Dedicated array of "RED FLAG: ..." observational
patterns.

**Why it is unnecessary**: Like rationalizations, these are already encoded as
`reminders[]` entries prefixed with `RED FLAG:`. The progressive-loading.md
proposes routing them to tier 2 by adding `"red flag"` to the
`isFileSpecificReminder()` keyword list (progressive-loading.md line 115). This
works within the existing reminder string approach.

**Verdict**: Add `"red flag"` to the keyword list in `isFileSpecificReminder()`
(concerns.ts line 128-137). No schema change needed.

### 2C. `phaseContent: Record<Phase, string[]>` -- NOT NEEDED

**What it would store**: Phase-specific reminder subsets so different content
loads at different phases.

**Why it is unnecessary**: The current two-tier system already achieves
phase-specific loading:

- DISCOVERY: all reminders via `getReminders()` (concerns.ts line 87)
- EXECUTING compile-time: tier 1 via `splitRemindersByTier().tier1` (line 140)
- EXECUTING per-file: tier 2 via `getTier2RemindersForFile()` (line 161)

The progressive-loading.md validates that this split is sufficient and that the
anti-rationalization tables (Part 3) and verification gates (Part 4) are just
human-readable reformattings of content already in `reminders[]` and
`acceptanceCriteria[]`.

**Verdict**: No new field. The tier split logic handles phase-specific loading.

### Summary

| Proposed Field     | Needed? | Alternative                                                           |
| ------------------ | ------- | --------------------------------------------------------------------- |
| `rationalizations` | No      | Use `reminders[]` with `RATIONALIZATION ALERT:` prefix                |
| `redFlags`         | No      | Use `reminders[]` with `RED FLAG:` prefix; add keyword to tier router |
| `phaseContent`     | No      | Existing tier 1/tier 2 split handles phase gating                     |

---

## 3. SpecClassification Extensions

### Current type (schema.ts lines 169-175)

```typescript
export type SpecClassification = {
  readonly involvesWebUI: boolean;
  readonly involvesCLI: boolean;
  readonly involvesPublicAPI: boolean;
  readonly involvesMigration: boolean;
  readonly involvesDataHandling: boolean;
};
```

### Proposed extension

Three new optional boolean fields are needed for classification-based reminder
gating, as identified in infrastructure-validation.md (section 5, Gap 3) and
progressive-loading.md (section 4C):

```typescript
export type SpecClassification = {
  // existing
  readonly involvesWebUI: boolean;
  readonly involvesCLI: boolean;
  readonly involvesPublicAPI: boolean;
  readonly involvesMigration: boolean;
  readonly involvesDataHandling: boolean;
  // proposed
  readonly involvesDeployment?: boolean;
  readonly involvesSecurity?: boolean;
  readonly involvesTests?: boolean;
};
```

#### 3A. `involvesDeployment?: boolean`

- **What it gates**: `shipping-safely` concern reminders (rollback plans,
  feature flags, monitoring, staged rollouts). Without this flag, these
  reminders would inject into every spec regardless of deployment relevance.
- **Source justification**: progressive-loading.md section 4B recommends gating
  shipping-safely behind `classification.involvesDeployment`.
- **Populated by**: The DISCOVERY phase classification step (agent classifies
  the spec based on discovery answers).
- **Default when absent**: `false` -- shipping-safely reminders suppressed
  unless explicitly flagged.

#### 3B. `involvesSecurity?: boolean`

- **What it gates**: Extended `compliance` security reminders (rate limiting,
  OWASP patterns, security headers, npm audit). The baseline compliance
  reminders (injection, XSS, secrets) always load; the extended set only loads
  when security is explicitly flagged.
- **Source justification**: progressive-loading.md section 4C.
- **Default when absent**: `false` -- extended security reminders suppressed.

#### 3C. `involvesTests?: boolean`

- **What it gates**: `testing-discipline` concern reminders (TDD cycle,
  reproduction tests, no-skip rules).
- **Source justification**: progressive-loading.md section 4C. Unlike deployment
  and security, this defaults to effectively "always on" since most specs
  involve tests. The flag exists to allow suppression for documentation-only or
  config specs.
- **Default when absent**: `true` (treat as test-involved unless explicitly
  marked otherwise) -- this is an exception to the other two flags.

---

## 4. Infrastructure Changes (from Validation Findings)

Six gaps identified in infrastructure-validation.md, with recommended fixes.

### Gap 1: `isFileSpecificReminder()` keyword expansion (HIGH)

**Location**: concerns.ts lines 128-137

**Problem**: The current keyword list only matches UI and API reminders.
Enriched concerns add deprecation, feature flag, security, accessibility, and
performance reminders that should be tier 2 but all fall through to tier 1.

**Fix**: Add keywords from progressive-loading.md section 2:

```typescript
const isFileSpecificReminder = (reminder: string): boolean => {
  const lower = reminder.toLowerCase();
  return (
    // existing
    lower.includes("slop") || lower.includes("ui element") ||
    lower.includes("design intentionality") ||
    lower.includes("interaction states") ||
    lower.includes("edge case check") ||
    lower.includes("loading state") ||
    lower.includes("api doc") || lower.includes("endpoint should be") ||
    lower.includes("migration") || lower.includes("rollback") ||
    // new: accessibility (UI files)
    lower.includes("keyboard navigation") ||
    lower.includes("color contrast") ||
    lower.includes("focus management") ||
    lower.includes("wcag") ||
    // new: performance (UI + API files)
    lower.includes("lcp") || lower.includes("inp") ||
    lower.includes("cls") || lower.includes("n+1") ||
    // new: security (API files)
    lower.includes("parameterized") || lower.includes("sql") ||
    lower.includes("rate limit") ||
    lower.includes("security header") ||
    lower.includes("csp") || lower.includes("hsts") ||
    lower.includes("stack trace") ||
    // new: API patterns (API files)
    lower.includes("pagination") ||
    lower.includes("error response") || lower.includes("error shape") ||
    // new: code patterns (code files)
    lower.includes("deprecat") || lower.includes("feature flag") ||
    lower.includes("console.log") ||
    // new: red flags (broad code files)
    lower.includes("red flag")
  );
};
```

### Gap 2: `migration` vs `migrate` matching (MEDIUM)

**Location**: concerns.ts line 136

**Problem**: `lower.includes("migration")` does not match "YOU migrate the
consumers" (from enriched long-lived reminder #7). The verb form is missed.

**Fix**: Add `lower.includes("migrate")` as a separate keyword. This is covered
by the `deprecat` keyword addition in Gap 1 (which catches "deprecation" and
"deprecate"), but `migrate` specifically needs its own entry:

```typescript
lower.includes("migration") || lower.includes("migrate") ||
```

Note: using `"migrat"` as a stem would match both "migration" and "migrate" in a
single check, but could false-positive on unrelated words. Prefer explicit
terms.

### Gap 3: Classification gating for new flags (MEDIUM)

**Location**: concerns.ts lines 87-124 (`getReminders()`)

**Problem**: `getReminders()` only filters by `involvesWebUI` and
`involvesPublicAPI`. The 3 new classification flags have no filtering logic.

**Fix**: Add filtering blocks for the new flags in `getReminders()`:

```typescript
// Deployment reminders -> only when involvesDeployment
if (
  (lower.includes("rollback") || lower.includes("deploy") ||
    lower.includes("feature flag") || lower.includes("staged rollout")) &&
  !classification.involvesDeployment
) {
  continue;
}

// Extended security reminders -> only when involvesSecurity
if (
  (lower.includes("rate limit") || lower.includes("security header") ||
    lower.includes("csp") || lower.includes("hsts") ||
    lower.includes("npm audit") || lower.includes("owasp")) &&
  !classification.involvesSecurity
) {
  continue;
}
```

### Gap 4: Reminder count cap for DISCOVERY phase (LOW)

**Location**: compiler.ts (wherever `compileDiscovery()` calls `getReminders()`)

**Problem**: With 10 active concerns and 104+ reminders, DISCOVERY would inject
~3,700 tokens of reminders. Progressive-loading.md recommends a cap of 60.

**Fix**: Add `maxReminders` parameter to `getReminders()` or truncate after the
call in `compileDiscovery()`:

```typescript
const allReminders = getReminders(activeConcerns, classification);
const capped = allReminders.slice(0, 60);
```

Concerns are already sorted by manifest order, so truncation preserves priority.

### Gap 5: `getTier2RemindersForFile` routing for new categories (LOW)

**Location**: concerns.ts lines 161-204

**Problem**: The function only routes UI reminders to UI files and API reminders
to API files. New categories (security, deprecation, performance, console.log)
have no routing rules.

**Fix**: Extend the routing logic with new category blocks:

```typescript
// Security reminders -> only for API/backend files
if (
  (lower.includes("parameterized") || lower.includes("sql") ||
    lower.includes("rate limit") || lower.includes("security header") ||
    lower.includes("stack trace")) && !isAPI
) {
  continue;
}

// Deprecation/feature flag -> code files (both UI and API)
if (
  (lower.includes("deprecat") || lower.includes("feature flag")) &&
  !isUI && !isAPI
) {
  continue;
}

// Console.log -> JS/TS files only
if (
  lower.includes("console.log") && ![".ts", ".js", ".tsx", ".jsx"].includes(ext)
) {
  continue;
}

// Red flags -> all code files
if (lower.includes("red flag") && !isUI && !isAPI) {
  continue;
}
```

### Gap 6: RED FLAG reminders routing (LOW)

**Location**: concerns.ts lines 128-137

**Problem**: RED FLAG reminders have no special keyword match. They become tier
1 instead of contextual tier 2.

**Fix**: Already covered by adding `lower.includes("red flag")` in Gap 1.
Combined with the routing in Gap 5 (broad file matching for red flags), this
delivers RED FLAG reminders contextually during file edits rather than as
always-visible tier 1 noise.

---

## 5. Backward Compatibility

### 5A. ConcernDefinition: No changes proposed

All enriched content fits into existing fields (`reminders[]`,
`acceptanceCriteria[]`, `extras[]`, `specSections[]`). Existing concern JSON
files continue to work unchanged. New concerns are additive JSON files.

| Change                             | Breaking? | Existing files need updating? | Missing-field behavior               |
| ---------------------------------- | --------- | ----------------------------- | ------------------------------------ |
| Add reminders to existing concerns | No        | Yes (append to arrays)        | N/A                                  |
| New concern JSON files             | No        | No                            | Not loaded unless listed in manifest |

### 5B. SpecClassification: 3 new optional fields

```typescript
readonly involvesDeployment?: boolean;
readonly involvesSecurity?: boolean;
readonly involvesTests?: boolean;
```

| Change                | Breaking?     | Existing state files need updating? | Missing-field behavior                                       |
| --------------------- | ------------- | ----------------------------------- | ------------------------------------------------------------ |
| `involvesDeployment?` | No (optional) | No                                  | Treated as `false` -- deployment reminders suppressed        |
| `involvesSecurity?`   | No (optional) | No                                  | Treated as `false` -- extended security reminders suppressed |
| `involvesTests?`      | No (optional) | No                                  | Treated as `true` -- testing reminders included by default   |

Existing `SpecClassification` objects that lack these fields are fully valid.
The `?` (optional) modifier means TypeScript will not require them. Runtime code
uses `classification.involvesDeployment` which evaluates to `undefined` (falsy)
when absent -- correct default behavior for deployment and security. For
`involvesTests`, the runtime check should use
`classification.involvesTests !== false` to default to `true`.

### 5C. `isFileSpecificReminder()` keyword expansion

| Change           | Breaking? | Effect on existing behavior                                                                                                                                                                                                                                                                                      |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new keywords | No        | Some existing reminders that happen to contain new keywords (e.g., "migration" already matched) will now also match new keywords. This is additive -- it moves reminders from tier 1 to tier 2, reducing EXECUTING compile-time budget. No reminder is lost; it just loads at hook-time instead of compile-time. |

### 5D. Reminder count cap

| Change                        | Breaking?                 | Effect                                                                                                                               |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cap DISCOVERY at 60 reminders | Non-breaking (soft limit) | Tail reminders from lower-priority concerns are not shown during DISCOVERY. They are still available in EXECUTING tier 1 and tier 2. |

---

## 6. Migration Notes

### Implementation order

```
Phase 1 (independent, parallelizable)
  |-- Task A: Extend isFileSpecificReminder() keywords [Gap 1, Gap 2, Gap 6]
  |-- Task B: Extend getTier2RemindersForFile() routing [Gap 5]
  |-- Task C: Add new concern JSON files [enriched-concerns.md Part 2]
  |-- Task D: Enrich existing concern JSON files [enriched-concerns.md Part 1]

Phase 2 (depends on Phase 1 completion for testing)
  |-- Task E: Add 3 new SpecClassification fields [schema change]
  |-- Task F: Add classification gating in getReminders() [Gap 3]
  |-- Task G: Add reminder count cap in compileDiscovery() [Gap 4]

Phase 3 (depends on Phase 2)
  |-- Task H: Update DISCOVERY classification prompt to populate new flags
  |-- Task I: Add tests for enriched tier split, classification gating, cap
```

### Effort estimates

| Task                     | Effort | Files Modified                                         |
| ------------------------ | ------ | ------------------------------------------------------ |
| A: Keyword expansion     | S      | `context/concerns.ts`                                  |
| B: Tier 2 routing        | S      | `context/concerns.ts`                                  |
| C: New concern JSONs     | S      | `defaults/concerns/` (4 new files)                     |
| D: Enrich existing JSONs | S      | `defaults/concerns/` (4 existing files)                |
| E: Schema extension      | S      | `state/schema.ts`                                      |
| F: Classification gating | M      | `context/concerns.ts`                                  |
| G: Reminder cap          | S      | `context/compiler.ts`                                  |
| H: Classification prompt | M      | `context/compiler.ts` (DISCOVERY section)              |
| I: Tests                 | M      | `context/concerns.test.ts`, `context/compiler.test.ts` |

**Total: ~2-3 days of focused work.** Phase 1 tasks are all S-sized and
independent. Phase 2 tasks are the core logic changes. Phase 3 is integration.

### Parallelization

- Tasks A+B can be done in a single PR (same file, related changes).
- Tasks C+D can be done in a single PR (content-only, no logic changes).
- Tasks E+F+G can be done in a single PR (schema + logic).
- Task H is a separate PR (prompt engineering).
- Task I spans all PRs (tests accompany each change).

---

## 7. Implementation Spec Outline

### Spec: "Implement Enriched Concern Pipeline"

#### Phase 1: Tier Routing Infrastructure

1. **Extend `isFileSpecificReminder()` keyword list** (concerns.ts lines
   128-137)
   - Add 17 new keywords from progressive-loading.md section 2
   - Fix `migration` vs `migrate` stem mismatch
   - Add `red flag` as tier 2 keyword
   - AC: All RATIONALIZATION ALERT reminders remain tier 1; all RED FLAG
     reminders route to tier 2; deprecation/feature-flag reminders route to tier
     2

2. **Extend `getTier2RemindersForFile()` routing** (concerns.ts lines 161-204)
   - Add security-keyword -> API-file routing
   - Add deprecation/feature-flag -> code-file routing
   - Add console.log -> JS/TS-file routing
   - Add red-flag -> all-code-file routing
   - AC: Each new keyword category only fires for its target file extensions

3. **Tests for tier routing**
   - Test enriched long-lived reminders: verify tier split matches expected
     (from infrastructure-validation.md section 2, corrected)
   - Test RED FLAG routing to tier 2 with broad file matching
   - Test RATIONALIZATION ALERT stays in tier 1

#### Phase 2: Concern Content

4. **Enrich existing concern JSON files**
   - `003-long-lived.json`: +10 reminders, +5 ACs, +3 extras, +3 specSections
   - `001-open-source.json`: +8 reminders, +5 ACs, +2 extras, +2 specSections
   - `002-beautiful-product.json`: +7 reminders, +5 ACs, +2 extras, +2
     specSections
   - `005-compliance.json`: +11 reminders, +8 ACs, +3 extras, +3 specSections
   - AC: All enriched JSON files parse as valid ConcernDefinition; existing
     tests still pass

5. **Add new concern JSON files**
   - `007-testing-discipline.json`
   - `008-shipping-safely.json`
   - `009-code-review-rigor.json`
   - (Defer `idea-quality` per progressive-loading.md recommendation)
   - AC: New files listed in `defaults/concerns/mod.ts`; loadable without errors

#### Phase 3: Classification Gating

6. **Extend SpecClassification type** (schema.ts lines 169-175)
   - Add `involvesDeployment?: boolean`
   - Add `involvesSecurity?: boolean`
   - Add `involvesTests?: boolean`
   - AC: Existing state files deserialize without errors; new fields optional

7. **Add classification filtering in `getReminders()`** (concerns.ts lines
   87-124)
   - Gate deployment keywords behind `involvesDeployment`
   - Gate extended security keywords behind `involvesSecurity`
   - AC: When `involvesDeployment` is false/absent, shipping-safely reminders
     excluded; when true, included

8. **Add reminder cap in `compileDiscovery()`**
   - Cap at 60 reminders, sorted by concern manifest order
   - AC: With 10 active concerns (104+ reminders), output capped at 60

#### Phase 4: Integration

9. **Update DISCOVERY classification prompt**
   - Include the 3 new flags in the classification question set
   - AC: Agent populates `involvesDeployment`, `involvesSecurity`,
     `involvesTests` during DISCOVERY

10. **Token budget validation**
    - Measure actual token counts for EXECUTING tier 1 with 6 active concerns
    - Verify within 1,000-token threshold
    - AC: EXECUTING tier 1 <= 1,000 tokens with typical concern set

11. **End-to-end test**
    - Full compile cycle with enriched concerns: DISCOVERY -> EXECUTING
    - Verify tier split, classification gating, per-file hook delivery
    - AC: No regression in existing concern pipeline tests
