# Spec: analyze-userseserprojectsplaygroundagent-skills

## Status: completed

## Concerns: long-lived, beautiful-product, open-source

## Discovery Answers

### status_quo

Both noskills and agent-skills solve the same core problem: AI agents take
shortcuts, skip specs/tests/reviews, optimize for 'done' over 'correct'.
noskills attacks this with state-driven orchestration (phases, gates, discovery
questions). agent-skills attacks it with structured workflow instructions
(anti-rationalization tables, verification checklists, red flags). Different
methodology, same goal. Today noskills already provides backpressure out of the
box with default settings. Any instruction, backpressure, or behavioral pattern
from agent-skills that improves the product is worth absorbing.

_-- Eser Ozvataf_

### ambition

1-star: Copy-paste a few agent-skills patterns as static text in behavioral
rules. 10-star: noskills becomes skill-aware — dynamically injecting relevant
engineering guidance based on spec context and phase. Key insight: noskills
already has the right abstraction via 'concerns'. Agent-skills' engineering
skills should map INTO the concern system, not create a parallel one. Example:
long-lived concern absorbs code-review + test-engineering + deprecation
guidance. compliance concern absorbs security-auditor + hardening patterns.
beautiful-product concern absorbs frontend-ui-engineering + accessibility. This
enriches existing infrastructure rather than building new. Aiming for 5-7 star:
structurally absorb patterns into the concern system, iterate from there.

_-- Eser Ozvataf_

### reversibility

Mostly reversible. Output is a plan, not code. The key decision — mapping skills
into the concern system — is confirmed as the right abstraction. Concerns are
config-driven so enrichments can be trimmed if they get too heavy. No need for a
separate skills layer. This decision will hold in 2 years as long as concerns
stay composable and don't become monolithic.

_-- Eser Ozvataf_

### user_impact

Affects existing users positively — more backpressure out of the box. Not a
breaking change. Key design constraint: progressive loading. Concern core stays
small (concise reminders) but can reference extended content that loads only
during specific phases. Example: security checklist loads only during REVIEW
phase, not during DISCOVERY. This mirrors agent-skills' own token-conscious
design (SKILL.md as entry point, references on-demand). Contributors get richer
examples to follow. Concern schema may need optional new fields
(rationalizations, redFlags) but existing concerns remain valid without them.

_-- Eser Ozvataf_

### verification

Verification for this plan-output spec: (1) Mapping completeness — every
agent-skills pattern catalogued and mapped to a noskills concern, or explicitly
deferred/skipped with justification. (2) Concern schema validation — any
proposed new optional fields must be backward-compatible with existing concern
definitions. (3) Token budget estimation — progressive loading should keep
per-phase injection reasonable. (4) Analysis document serves as documentation.
Implementation verification (unit tests, integration tests, snapshot tests for
sync output) deferred to follow-up implementation spec.

_-- Eser Ozvataf_

### scope_boundary

Out of scope: (1) Don't copy agent-skills verbatim — absorb patterns, not prose.
(2) No separate skills layer — concerns are the abstraction. (3) Don't change
noskills' state machine — enrich what happens within phases, not the phase flow.
(4) No code implementation in this spec — output is analysis + plan only. (5)
Don't import agent-skills as a dependency — noskills owns its content. (6) No
tool-specific integrations (Cursor, Copilot) — noskills has its own sync
adapters. Tech debt risk: progressive loading adds implementation complexity in
follow-up spec, but keeps concerns maintainable.

_-- Eser Ozvataf_

## Out of Scope

- Out of scope: (1) Don't copy agent-skills verbatim — absorb patterns, not
  prose. (2) No separate skills layer — concerns are the abstraction. (3) Don't
  change noskills' state machine — enrich what happens within phases, not the
  phase flow. (4) No code implementation in this spec — output is analysis +
  plan only. (5) Don't import agent-skills as a dependency — noskills owns its
  content. (6) No tool-specific integrations (Cursor, Copilot) — noskills has
  its own sync adapters
- Tech debt risk: progressive loading adds implementation complexity in
  follow-up spec, but keeps concerns maintainable.

## Tasks

- [x] task-1: Catalog all 20 agent-skills patterns — for each, summarize what it
      does, assess its value for noskills (high/medium/low/skip), and note which
      noskills concern it maps to.
- [x] task-2: For each high/medium-value pattern, extract the concrete content
      (anti-rationalization tables, verification checklists, red flags) and
      adapt it into noskills concern reminder format.
- [x] task-3: Design progressive loading strategy — define which enriched
      content loads at which phase (DISCOVERY, EXECUTING, REVIEW, etc.) and
      estimate token budget impact per phase.
- [x] task-4: Validate current noskills infrastructure — verify that progressive
      loading, phase-aware content injection, token budget management, and
      on-demand reference loading work correctly with enriched concerns. Test
      with a real concern to ensure content is injected at the right phase and
      stays within budget.
- [x] task-5: Document concern schema extension needs for follow-up
      implementation spec — list proposed optional fields (rationalizations,
      redFlags, phaseContent), backward-compatibility requirements, and
      migration notes.

## Verification

- Verification for this plan-output spec: (1) Mapping completeness — every
  agent-skills pattern catalogued and mapped to a noskills concern, or
  explicitly deferred/skipped with justification. (2) Concern schema validation
  — any proposed new optional fields must be backward-compatible with existing
  concern definitions. (3) Token budget estimation — progressive loading should
  keep per-phase injection reasonable. (4) Analysis document serves as
  documentation
- Implementation verification (unit tests, integration tests, snapshot tests for
  sync output) deferred to follow-up implementation spec.

## Transition History

| From | To        | User         | Timestamp                | Reason |
| ---- | --------- | ------------ | ------------------------ | ------ |
| IDLE | DISCOVERY | Eser Ozvataf | 2026-04-04T11:16:01.254Z | -      |
