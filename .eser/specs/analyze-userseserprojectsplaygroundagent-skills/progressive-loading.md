# Progressive Loading Strategy for Enriched Concerns

## Overview

This document defines which enriched content loads at which noskills phase,
proposes tier classification rules for new reminders, estimates token budgets,
and recommends pruning/deferral decisions. It builds on the existing injection
model in `compiler.ts` and `concerns.ts` without proposing new infrastructure.

---

## 1. Phase-Content Matrix

Each content type maps to exactly the phase(s) where it delivers maximum
backpressure value.

| Content Type                           | DISCOVERY      | DISCOVERY_REVIEW | SPEC_DRAFT                | EXECUTING (compile)                                                    | EXECUTING (per-file hook) |
| -------------------------------------- | -------------- | ---------------- | ------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| **Reminders (general / tier 1)**       | Full           | --               | --                        | Tier 1 only                                                            | --                        |
| **Reminders (file-specific / tier 2)** | Full           | --               | --                        | --                                                                     | Filtered by ext           |
| **Reminders (RATIONALIZATION ALERT)**  | Full           | --               | --                        | Tier 1                                                                 | --                        |
| **Reminders (RED FLAG)**               | Full           | --               | --                        | --                                                                     | Filtered by ext           |
| **Extras (discovery questions)**       | Per questionId | --               | --                        | --                                                                     | --                        |
| **specSections**                       | --             | --               | `checkSectionRelevance()` | --                                                                     | --                        |
| **acceptanceCriteria**                 | --             | --               | Classification-filtered   | Included in statusReport                                               | --                        |
| **Verification gates**                 | --             | --               | --                        | statusReport.criteria                                                  | --                        |
| **Anti-rationalization tables**        | --             | --               | --                        | _Not injected separately_ (already in RATIONALIZATION ALERT reminders) | --                        |

### Rationale for each assignment

- **RATIONALIZATION ALERT reminders -> tier 1 during EXECUTING**: These fire
  when agents are tempted to shortcut. Tier 1 ensures they are always visible
  during execution, not just when editing specific file types. They are short
  (one line each) and high-value.

- **RED FLAG reminders -> tier 2 during EXECUTING**: Red flags are observational
  patterns (e.g., "writing code without tests", "deploying without rollback
  plan"). They are most useful contextually when the agent is editing a relevant
  file. Classified as tier 2 with extended keyword matching (see section 2).

- **Verification gates -> statusReport.criteria**: These are concrete checklists
  that map 1:1 to acceptance criteria. They belong in the `statusReport` block
  that already exists in EXECUTING phase outputs, not as free-floating
  reminders. The existing AC system already delivers these.

- **Anti-rationalization tables (Part 3 of enriched-concerns.md)**: These are
  the same content as the RATIONALIZATION ALERT reminders already embedded in
  each concern. No separate injection needed -- they exist for human reference
  only.

---

## 2. Tier Classification Rules

### Current keyword matching (from `isFileSpecificReminder`)

```
tier 2 if lowercase contains:
  slop | ui element | design intentionality | interaction states |
  edge case check | loading state | api doc | endpoint should be |
  migration | rollback
```

### Extended keywords for enriched content

New reminders that should route to tier 2 (file-specific, delivered via
PreToolUse hook):

| New Keyword                        | Matches                                        | File Types                             |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `keyboard navigation`              | beautiful-product accessibility reminders      | .tsx, .jsx, .html, .svelte, .vue       |
| `color contrast`                   | beautiful-product WCAG reminders               | .tsx, .jsx, .html, .css, .svelte, .vue |
| `focus management`                 | beautiful-product focus reminders              | .tsx, .jsx, .html, .svelte, .vue       |
| `wcag`                             | beautiful-product accessibility ACs            | .tsx, .jsx, .html, .css                |
| `lcp` / `inp` / `cls`              | beautiful-product Core Web Vitals              | .tsx, .jsx, .html, .css                |
| `n+1`                              | beautiful-product / code-review query patterns | .ts, .go, .py, .rs                     |
| `parameterized` / `sql`            | compliance SQL injection reminders             | .ts, .go, .py, .rs                     |
| `rate limit`                       | compliance rate-limiting reminders             | .ts, .go, .py, .rs                     |
| `security header` / `csp` / `hsts` | compliance security headers                    | .ts, .go, .py, .rs                     |
| `stack trace`                      | compliance error exposure                      | .ts, .go, .py, .rs                     |
| `pagination`                       | open-source API pagination                     | .ts, .go, .py, .rs                     |
| `error response` / `error shape`   | open-source / compliance error format          | .ts, .go, .py, .rs                     |
| `deprecat`                         | long-lived deprecation reminders               | .ts, .go, .py, .rs                     |
| `feature flag`                     | long-lived / shipping-safely flag reminders    | .ts, .go, .py, .rs                     |
| `console.log`                      | shipping-safely debug cleanup                  | .ts, .js, .tsx, .jsx                   |
| `red flag`                         | All RED FLAG reminders                         | Contextual (see below)                 |

### RED FLAG routing

RED FLAG reminders need special handling. They describe observable _patterns_
rather than file-type rules. Proposed approach: classify RED FLAGs as tier 2
with broad file matching (all code files: .ts, .tsx, .jsx, .go, .py, .rs), but
only inject the RED FLAGs relevant to the concern's domain. This uses the
existing `getTier2RemindersForFile` mechanism -- just extend the keyword list.

### Updated `isFileSpecificReminder` additions

```typescript
// Add to existing keyword checks:
lower.includes("keyboard navigation") ||
  lower.includes("color contrast") ||
  lower.includes("focus management") ||
  lower.includes("wcag") ||
  lower.includes("lcp") || lower.includes("inp") || lower.includes("cls") ||
  lower.includes("n+1") ||
  lower.includes("parameterized") || lower.includes("sql") ||
  lower.includes("rate limit") ||
  lower.includes("security header") || lower.includes("csp") ||
  lower.includes("hsts") ||
  lower.includes("stack trace") ||
  lower.includes("pagination") ||
  lower.includes("error response") || lower.includes("error shape") ||
  lower.includes("deprecat") ||
  lower.includes("feature flag") ||
  lower.includes("console.log") ||
  lower.includes("red flag");
```

---

## 3. Token Budget Estimation

Estimation rule: 1 token ~ 4 characters for English text.

### 3A. Current baseline (6 existing concerns)

| Concern                 | Chars (JSON) | Reminders | Tier 1 (general) | Tier 2 (file-specific)      |
| ----------------------- | ------------ | --------- | ---------------- | --------------------------- |
| open-source (001)       | 931          | 4         | 3                | 1 (`endpoint should be`)    |
| beautiful-product (002) | 3038         | 7         | 1                | 6 (slop, UI, loading, etc.) |
| long-lived (003)        | 1221         | 4         | 4                | 0                           |
| move-fast (004)         | 703          | 3         | 3                | 0                           |
| compliance (005)        | 795          | 3         | 3                | 0                           |
| learning-project (006)  | 740          | 3         | 3                | 0                           |
| **Total**               | **7,428**    | **24**    | **17**           | **7**                       |

Estimated current token budget by phase:

| Phase                  | What's injected                              | Est. chars | Est. tokens |
| ---------------------- | -------------------------------------------- | ---------- | ----------- |
| DISCOVERY              | All 24 reminders + concern prefixes + extras | ~2,600     | ~650        |
| EXECUTING (tier 1)     | 17 general reminders                         | ~1,700     | ~425        |
| Per-file hook (tier 2) | 0-7 file-specific reminders                  | ~0-800     | ~0-200      |

_Note: The task description says ~520 tokens total, which aligns with tier 1
only. Full DISCOVERY injection is higher._

### 3B. After enrichment (4 existing concerns + 4 new concerns)

#### Enriched existing concerns

| Concern                 | New Reminders | New ACs | New Extras | Added chars (est.) |
| ----------------------- | ------------- | ------- | ---------- | ------------------ |
| long-lived (003)        | +10           | +5      | +3         | +1,800             |
| open-source (001)       | +8            | +5      | +2         | +1,400             |
| beautiful-product (002) | +7            | +5      | +2         | +1,200             |
| compliance (005)        | +11           | +8      | +3         | +2,200             |
| **Subtotal**            | **+36**       | **+23** | **+10**    | **+6,600**         |

#### New concerns

| Concern            | Reminders | ACs    | Extras | Chars (est.) |
| ------------------ | --------- | ------ | ------ | ------------ |
| testing-discipline | 12        | 6      | 3      | 2,400        |
| shipping-safely    | 12        | 7      | 3      | 2,600        |
| idea-quality       | 9         | 7      | 4      | 2,200        |
| code-review-rigor  | 11        | 5      | 2      | 2,400        |
| **Subtotal**       | **44**    | **25** | **12** | **9,600**    |

#### Combined totals

| Metric                       | Current | After Enrichment | Delta      |
| ---------------------------- | ------- | ---------------- | ---------- |
| Total concerns               | 6       | 10               | +4         |
| Total reminders              | 24      | 104              | +80 (4.3x) |
| Total ACs                    | 20      | 68               | +48 (3.4x) |
| Total extras                 | 17      | 39               | +22 (2.3x) |
| Total chars (reminders only) | ~2,600  | ~11,800          | +9,200     |

### 3C. Per-phase token budget after enrichment

#### Tier split estimate for 104 reminders

Applying the extended tier classification rules from section 2:

| Category                                                       | Count   | Tier                                     |
| -------------------------------------------------------------- | ------- | ---------------------------------------- |
| RATIONALIZATION ALERT reminders                                | ~14     | Tier 1 (always visible during EXECUTING) |
| RED FLAG reminders                                             | ~8      | Tier 2 (per-file hook)                   |
| General reminders (no file-type keywords)                      | ~52     | Tier 1                                   |
| File-specific reminders (UI/API/security/deprecation keywords) | ~30     | Tier 2                                   |
| **Tier 1 total**                                               | **~66** |                                          |
| **Tier 2 total**                                               | **~38** |                                          |

#### Phase budgets

| Phase                  | Content                                      | Est. chars | Est. tokens | vs. Current  | Flag?                 |
| ---------------------- | -------------------------------------------- | ---------- | ----------- | ------------ | --------------------- |
| DISCOVERY              | All 104 reminders + extras (39)              | ~14,800    | **~3,700**  | 5.7x current | **EXCEEDS THRESHOLD** |
| SPEC_DRAFT             | specSections (filtered) + ACs (68, filtered) | ~4,500     | **~1,125**  | N/A (new)    | OK                    |
| EXECUTING (tier 1)     | 66 general reminders                         | ~7,200     | **~1,800**  | 4.2x current | **EXCEEDS THRESHOLD** |
| Per-file hook (tier 2) | 0-15 file-specific reminders                 | ~0-1,600   | **~0-400**  | 2x current   | OK                    |
| Status report          | 68 ACs (filtered to active)                  | ~4,000     | **~1,000**  | N/A (new)    | OK                    |

### 3D. Suggested thresholds

| Phase                  | Suggested Max Tokens | Reason                                                                                                                         |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| DISCOVERY              | 2,000                | Discovery output already heavy with questions, mode selection, premise challenge. Reminders are backdrop, not primary content. |
| EXECUTING (tier 1)     | 1,000                | Execution context includes behavioral rules (~800 tokens), task block, transition commands. Reminders must not dominate.       |
| Per-file hook (tier 2) | 400                  | Hook context is additive per file edit. Must stay small.                                                                       |
| Status report          | 600                  | ACs are the core of status reporting. Keep focused.                                                                            |

---

## 4. Recommendations

### 4A. Highest ROI enrichments (most impact per token)

Ranked by backpressure-value-per-token:

1. **RATIONALIZATION ALERT reminders** (~14 reminders, ~1,400 chars, ~350
   tokens). These are the single highest-ROI addition. Each is one line, fires
   at the exact moment an agent rationalizes a shortcut, and addresses the most
   common failure mode. Load all 14 as tier 1 during EXECUTING.

2. **Security/compliance reminders for tier 2** (~8 reminders, ~800 chars, ~200
   tokens). SQL injection, secrets in code, stack traces -- these fire only when
   editing relevant files via PreToolUse hook. Zero cost when not relevant, high
   value when relevant.

3. **Testing-discipline reminders (tier 1 subset)** (~6 reminders, ~600 chars,
   ~150 tokens). "Write failing test first", "bug fixes need reproduction test",
   "no test skipping" -- these address the second most common agent failure mode
   after rationalization.

4. **RED FLAG reminders for tier 2** (~8 reminders, ~800 chars, ~200 tokens).
   Pattern-matching alerts that fire contextually. Good ROI because they cost
   nothing when not triggered.

### 4B. Enrichments to defer or prune

To stay within the suggested thresholds, the following should be deferred:

1. **Idea-quality concern**: Only relevant during DISCOVERY phase, which is
   already over budget. This concern's reminders ("start with the user",
   "not-doing list", "be honest not supportive") overlap significantly with
   existing DISCOVERY behavioral rules in `buildBehavioral()`. **Recommendation:
   Defer entirely.** Extract 2-3 non-redundant reminders into existing
   behavioral rules instead of a separate concern.

2. **Shipping-safely concern (partial)**: The deploy/rollback/monitoring
   reminders are only relevant for specs that involve deployment. They should be
   classification-gated: only inject when `classification.involvesDeployment` is
   true (new classification flag needed). **Recommendation: Add but gate behind
   classification.** Without gating, defer.

3. **Verbose reminders in long-lived and open-source**: Several enriched
   reminders are 80+ characters and say the same thing as existing reminders
   with more words. Examples:
   - "Every observable API behavior is a de facto contract (Hyrum's Law) -- be
     intentional about what you expose" overlaps with existing "Endpoint should
     be documented in API docs".
   - "Comment the WHY, not the WHAT -- code shows what, docs explain why and
     what was rejected" overlaps with existing documentation reminders.
     **Recommendation: Merge overlapping reminders rather than adding both.**

4. **Verification gates (Part 4)**: These map 1:1 to acceptance criteria already
   captured in the AC arrays. They should NOT be injected as a separate content
   type. The existing `statusReport.criteria` mechanism already delivers them.
   **Recommendation: Do not add as separate injection. ACs are sufficient.**

5. **Anti-rationalization reference table (Part 3)**: This is a human-readable
   grouping of RATIONALIZATION ALERT reminders that already exist individually
   in each concern. **Recommendation: Do not inject. Human reference only.**

### 4C. Tier system: keep two tiers, add classification gating

The current two-tier system (tier 1 = compile-time, tier 2 = per-file hook) is
sufficient. Adding a tier 3 would complicate the model without clear benefit.

Instead, apply these strategies to stay within budget:

1. **Classification gating for EXECUTING tier 1**: Filter reminders by
   classification flags during compile-time (the `getReminders` function already
   does this for `involvesWebUI` and `involvesPublicAPI`). Extend to:
   - `involvesDeployment` -> shipping-safely reminders
   - `involvesSecurity` -> compliance security reminders (beyond baseline)
   - `involvesTests` -> testing-discipline reminders (always on by default)

2. **Concern activation**: Not all 10 concerns will be active simultaneously.
   The manifest's `concerns` array controls which are active. A typical project
   might activate 4-6. With 6 active concerns instead of 10, the tier 1 budget
   drops from ~1,800 to ~1,100 tokens -- within threshold.

3. **DISCOVERY phase pruning**: During DISCOVERY, inject only reminders from
   active concerns (already the case) and cap at the first 60 reminders. Beyond
   60, the agent cannot meaningfully process them. Sort by concern priority
   (concern order in manifest).

### 4D. Summary budget after recommendations

Assuming 6 active concerns (typical), with deferred/pruned content:

| Phase                  | Tokens (projected) | Within threshold?               |
| ---------------------- | ------------------ | ------------------------------- |
| DISCOVERY              | ~1,800             | OK (with 60-reminder cap)       |
| EXECUTING (tier 1)     | ~900               | OK (with classification gating) |
| Per-file hook (tier 2) | ~0-350             | OK                              |
| Status report          | ~500               | OK                              |

### 4E. Implementation priority

1. **Add RATIONALIZATION ALERT reminders to existing 4 concerns** (highest ROI,
   no new infra)
2. **Add testing-discipline as new concern** (second highest ROI)
3. **Add code-review-rigor as new concern** (third highest ROI)
4. **Extend `isFileSpecificReminder` keywords** (enables tier 2 for new content)
5. **Add classification gating for deployment/security** (budget control)
6. **Defer idea-quality and shipping-safely** (low ROI per token, overlap with
   existing behavioral rules)
