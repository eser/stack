# [@eserstack/noskills](./) — Technical Reference

This document covers the internals: state machine, hooks, compiler, CLI, API,
concerns, and configuration. For the overview and getting started, see
[README.md](./README.md).

---

## Table of Contents

- [The State Machine](#the-state-machine)
- [The JSON Output](#the-json-output)
- [Discovery](#discovery)
- [Concerns](#concerns)
  - [Authoring a Concern](#authoring-a-concern)
- [Hooks](#hooks)
- [Verification Backpressure](#verification-backpressure)
- [Tool Sync](#tool-sync)
- [Spec Management](#spec-management)
- [Multi-User](#multi-user)
- [Packs](#packs)
- [Autonomous Execution](#autonomous-execution)
- [Configuration](#configuration)
- [Directory Structure](#directory-structure)
- [CLI Reference](#cli-reference)
- [Library API](#library-api)
- [Platform Details](#platform-details)

---

## The State Machine

Every spec follows a deterministic phase flow:

```
IDLE → DISCOVERY → REFINEMENT → PROPOSAL → APPROVED → EXECUTING ↔ BLOCKED
 ^        ^                                        |
 |        +-------------- revisit -----------------+
 |                                                 |
 +------------------ COMPLETED ←------------------+
                    (done | cancelled | wontfix)
```

Any phase can reach COMPLETED via `cancel` or `wontfix`. COMPLETED can return to
IDLE (reset) or DISCOVERY (reopen). EXECUTING/BLOCKED can return to DISCOVERY
via `revisit` — progress is preserved so you can re-scope without losing work.

| Phase          | What happens                                                           |
| -------------- | ---------------------------------------------------------------------- |
| **IDLE**       | No active spec. Default permissive state — no enforcement              |
| **DISCOVERY**  | 6 adaptive questions probe product, engineering, and QA simultaneously |
| **REFINEMENT** | User reviews and confirms all discovery answers before spec generation |
| **PROPOSAL**   | Spec generated from discovery answers. Human reviews                   |
| **APPROVED**   | Spec approved, waiting to start. A deliberate "ready but not yet" gate |
| **EXECUTING**  | Agent works through the spec. Reports progress each iteration          |
| **BLOCKED**    | Agent hit a decision it can't make alone. Human resolves               |
| **COMPLETED**  | Spec complete (done, cancelled, or wontfix). Summary + learnings       |

### Phase Transition Protocol

Every phase transition follows the same structured cycle:

```text
Human input -> Agent evaluates -> Validator reviews (opt-in) -> Human approves -> Next phase
```

The agent that does the work also evaluates it. At two transitions you can also
have a second agent check the work before you approve it:

| Transition       | Phase change                         | What you approve                                        |
| ---------------- | ------------------------------------ | ------------------------------------------------------- |
| End of discovery | DISCOVERY_REFINEMENT → SPEC_PROPOSAL | The discovery answers that the spec draft is built from |
| Spec proposal    | SPEC_PROPOSAL → SPEC_APPROVED        | The classified spec draft, its tasks and its criteria   |

#### The transition validator

The validator is a second agent that `noskills next` runs through
`@eserstack/ai`. It checks the transition in an isolated context and sees only:

- the spec's name, its description and its `spec.md` (cut at 100,000
  characters);
- the discovery answers with their questions, and the answered follow-ups,
  without the names of the people who gave them;
- the transition and what approving it means.

It does not get the codebase or the working agent's conversation. A CLI agent
(claude-code, kiro, opencode) runs in a new, empty temporary directory, so the
project's files, rules and hooks are not in its working directory; its
user-level settings still apply.

Turn it on for one call with the flag:

```bash
noskills spec photo-upload next --validate
```

Without a manifest entry, `--validate` runs claude-code with `claude-sonnet-5`,
the agent `noskills run` drives. To run the validator at every `next` call that
reaches one of the two transitions, add a `validate` entry with an agent and a
model to the manifest's noskills section:

```yaml
noskills:
  validate:
    agent: claude-code # an @eserstack/ai provider
    model: claude-sonnet-5 # a model id that provider runs
```

`agent` is one of claude-code, anthropic, openai, gemini, vertexai, ollama,
opencode or kiro, resolved the way `noskills run` resolves its agent. API
providers read their key from the provider's environment variable, such as
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. With the entry, the validator runs once
per input: `next` stores the result in
`.eser/.state/progresses/validations/<spec>.json` and repeats it until the spec
document, the answers, the transition or the agent change. `--validate` always
runs it again.

The result is the `validation` field of the `next` output. The agent presents
the findings to you before it asks for your approval:

```jsonc
{
  "phase": "SPEC_PROPOSAL",
  "validation": {
    "status": "reviewed",
    "transition": {
      "id": "spec-proposal",
      "from": "SPEC_PROPOSAL",
      "to": "SPEC_APPROVED",
      "approval": "The user approves the spec draft, and its tasks and acceptance criteria become the work to execute and check."
    },
    "agent": "claude-code",
    "model": "claude-sonnet-5",
    "summary": "One task has no acceptance criterion.",
    "findings": [{
      "severity": "medium",
      "issue": "task-3 names no acceptance criterion.",
      "suggestion": "Add a criterion that names the expected output."
    }],
    "instruction": "A second model checked this transition in an isolated context: ..."
  }
}
```

The findings are advice: the validator never blocks a transition, and you decide
what to change. Severity is `high` when approving now builds the wrong thing or
loses data, `medium` when the spec needs a change before work starts, and `low`
when a point is worth a look.

When no agent can be resolved, the manifest entry is unusable, the call fails,
the reply is not the expected JSON, or 120 seconds pass without an answer,
`validation.status` is `skipped` and `validation.reason` says why. The
transition then goes to your approval as usual. Run `next --validate` to try
again.

---

## The JSON Output

Every `noskills next` call returns a structured JSON payload:

```jsonc
{
  "phase": "EXECUTING",
  "instruction": "Execute the current task. When done, report progress.",
  "task": {
    "id": "task-2",
    "title": "Add photo upload endpoint with validation",
    "totalTasks": 5,
    "completedTasks": 1
  },
  "meta": {
    "protocol": "Run `eser noskills next --answer=\"...\"` to submit results and advance",
    "spec": "photo-upload",
    "branch": null,
    "iteration": 3,
    "lastProgress": "implemented auth module",
    "activeConcerns": ["open-source", "beautiful-product"],
    "resumeHint": "Executing \"photo-upload\", iteration 3. Last progress: implemented auth module.",
    "enforcement": {
      "level": "enforced",
      "capabilities": [
        "PreToolUse file edit gate",
        "Git write guard",
        "Stop iteration tracking",
        "PostToolUse file logging",
        "Sub-agent delegation"
      ]
    }
  },
  "behavioral": {
    "rules": [
      "NEVER run git write commands.",
      "Do not explore beyond the current task.",
      "Do not refactor outside this task's scope.",
      "Complete the task, then report progress."
    ],
    "tone": "Direct. Orchestrate immediately — spawn sub-agents."
  },
  "context": {
    "rules": ["Use Deno for all TypeScript"],
    "concernReminders": [
      "open-source: Endpoint should be documented in API docs",
      "beautiful-product: Loading and error states must be designed"
    ]
  },
  "transition": {
    "onComplete": "eser noskills next --answer=\"...\"",
    "onBlocked": "eser noskills block \"reason\"",
    "iteration": 3
  }
}
```

When concerns conflict, the output includes a tension block:

```jsonc
{
  "concernTensions": [{
    "between": ["move-fast", "compliance"],
    "issue": "Skipping audit log saves ~2h but violates compliance concern."
  }]
}
```

Tensions require human resolution — noskills never auto-resolves them.

### Output Formats

```bash
noskills next              # JSON (default, for agents)
noskills next -o markdown  # Human-readable
noskills next -o text      # Plain text
```

---

## Discovery

### Questions

Six questions, each probing product + engineering + QA at once:

1. **What does the user do today without this feature?**
2. **Describe the 1-star and 10-star versions.**
3. **Does this change involve an irreversible decision?**
4. **Does this change affect existing users' behavior?**
5. **How do you verify this works correctly?**
6. **What should this feature NOT do?**

Active concerns inject sub-questions. With `open-source` active, Q1 also asks:
_"Is this workaround common in the community?"_

### Discovery Modes

| Mode            | Focus                   | Best for               |
| --------------- | ----------------------- | ---------------------- |
| full            | Standard 6 questions    | New features (default) |
| validate        | Challenge assumptions   | Detailed plans         |
| technical-depth | Architecture, data flow | Infrastructure         |
| ship-fast       | Minimum viable scope    | Bug fixes              |
| explore         | Think bigger            | Brainstorming          |

### Asking the Questions

`noskills next` hands the agent every unanswered base question in one output,
with one instruction: ask them together and submit the confirmed answers as one
JSON object keyed by question id.

```bash
noskills spec upload next --agent --answer='{"status_quo":"...","ambition":"...","reversibility":"...","user_impact":"...","verification":"...","scope_boundary":"..."}'
```

A tool with AskUserQuestion asks them in as few calls as it can (each call takes
up to 4 questions, so the six take two); other tools list them in one message.
An object that answers only some questions records those, and the next output
asks the rest. A key that is not a question id is refused, so a misspelt id
cannot sit in the state unread. Plain text still answers the first open
question, for agents that follow older instructions.

Follow-ups come one at a time. Every generated instruction file (CLAUDE.md,
AGENTS.md, the Kiro steering file and the Cursor, Windsurf and Copilot rule
files) and the `next` rules state the same rule.

### Adaptive Follow-ups

When an answer is vague, risky, or names a technology or a dependency, the agent
registers up to 3 follow-ups for it before it submits the answers. Once every
base question has an answer, `next` hands out the pending follow-ups one per
output, and discovery completes when the last one is answered or skipped.

```bash
noskills spec upload followup reversibility "What's the rollback plan?"
noskills spec upload followup reversibilitya --answer="Feature flag, off by default"
noskills spec upload followup reversibilitya --skip
```

A follow-up's id is its question's id followed by a letter (`a`, `b`, `c`).
`followup` refuses an id that names no pending follow-up.

### Premise Challenge

Before Q1, noskills challenges the spec's premises: Is this the right problem?
What happens if we do nothing? What existing code already solves part of this?

### Alternatives Generation

After discovery is approved, noskills prompts for 2-3 implementation approaches
before generating the spec. You pick one or skip.

### Rich Description Pre-fill

Descriptions >500 chars or plan files (`--from-plan`) get pre-filled answers
marked as [STATED] (your words) or [INFERRED] (agent's interpretation). You
confirm or correct each one, and the agent submits only confirmed answers, in
the one call that `transition.onComplete` shows.

### Spec Classification

After discovery, classify the spec along 5 boolean axes (UI, CLI, API,
migration, data handling). This determines which concern sections appear.

### Delegation

During discovery, any question can be delegated to someone else:

```
Q3: What's the error handling strategy?
> [d] Delegate to ahmet
```

Delegated items must be answered before the spec can be approved — like GitHub
reviewers.

---

## Concerns

Concerns define what your project IS. They stack, but only the current phase's
slice is delivered — never the full concern payload at once:

| Concern               | Effect                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| **open-source**       | Prioritize contributor experience, permissive defaults                   |
| **beautiful-product** | Every UI state specified, no AI slop, accessibility                      |
| **long-lived**        | Boring technology, justify every shortcut, failure mode analysis         |
| **move-fast**         | Good enough is good enough, defer polish                                 |
| **compliance**        | Every state change traceable, verification mandatory                     |
| **learning-project**  | Experimentation encouraged, document learnings                           |
| **well-engineered**   | Performance measured, tests strategic, errors helpful, security built-in |

Each phase gets only what it needs from concerns — not the full definition.
DISCOVERY gets extras and dream state prompts. REFINEMENT gets review dimensions
(scope-filtered). PROPOSAL gets spec sections and registry skeletons. EXECUTING
gets reminders and ACs. Zero upfront dump. Reminders, spec sections and review
dimensions can declare a `scope`, which limits them to the specs and files it
names; [Where content applies](#where-content-applies-scope) lists the values.

### Review Dimensions

Concerns can define **review dimensions** — structured review criteria that
inject into REFINEMENT as a checklist. Each dimension is a short prompt (one
sentence), not a page of instructions. Dimensions are scope-filtered: a CLI-only
spec never sees UI dimensions.

```jsonc
// Each dimension is a single prompt — the agent evaluates one at a time
{
  "reviewDimensions": [
    {
      "id": "test-strategy",
      "label": "Test Pyramid Strategy",
      "prompt": "Map every new behavior to a test layer: Unit | Integration | E2E. Flag untested failure paths.",
      "evidenceRequired": true,
      "scope": "all" // "all" | "ui" | "api" | "data" | "migration"
    }
  ]
}
```

Dimensions are scope-filtered by `SpecClassification`: UI-scoped dimensions only
appear when `involvesWebUI` is true. Before classification (in REFINEMENT), all
dimensions are shown.

### Registries

Concerns can declare **registries** — review dimensions that require a
structured table in the spec. These are living documents filled during
execution.

```jsonc
// long-lived declares two registries
{ "registries": ["error-rescue", "failure-modes"] }
```

The spec template renders empty table skeletons:

```markdown
## Error & Rescue Registry (long-lived)

| Codepath                         | What Can Go Wrong | Exception Class | Rescued? | Recovery Action | User Sees |
| -------------------------------- | ----------------- | --------------- | -------- | --------------- | --------- |
| _To be filled during execution._ |                   |                 |          |                 |           |
```

Built-in registry types: `error-rescue`, `failure-modes`, `test-plan`.

### Dream State Prompts

Concerns can define a **dream state prompt** that customizes the vision
synthesis step in discovery:

```jsonc
// long-lived pushes architectural trajectory
{
  "dreamStatePrompt": "Synthesize: CURRENT STATE → THIS SPEC → 6-MONTH IDEAL..."
}
```

When present, this replaces the default dream state rule in the DISCOVERY
behavioral block.

### Authoring a Concern

Drop a `.json` file in `.eser/concerns/` and it will be picked up automatically
at runtime — no registration needed. Built-in concerns live in
`pkg/@eserstack/noskills/defaults/concerns/` and use static imports for bundle
compatibility, but your project concerns load via the filesystem loader.

#### File layout

```
.eser/
└── concerns/
    └── 100-fintech-compliance.json   # numeric prefix controls load order
```

Name the file `<NNN>-<id>.json`. The numeric prefix controls load order relative
to built-ins (001–007). Use 100+ for project concerns to load after built-ins.

#### Schema reference

Every concern is a `ConcernDefinition` object. Minimal example (copy-paste and
edit):

```jsonc
{
  "id": "fintech-compliance", // stable identifier — used as prefix in prompt reminders
  "name": "Fintech Compliance", // human-readable label
  "description": "Short description of what this concern enforces.",
  "extras": [ // sub-questions injected into DISCOVERY
    {
      "questionId": "reversibility", // matches one of the 6 base question IDs
      "text": "Is the audit trail preserved on rollback?"
    }
  ],
  "specSections": ["Audit Trail"], // sections added to the generated spec
  "reminders": [ // a plain string is shown in every EXECUTING prompt
    "Every state change must be traceable to an actor and timestamp",
    { // a scoped reminder reaches only the specs and files its scope names
      "text": "Mask account numbers in every log line",
      "scope": ["data"]
    }
  ],
  "acceptanceCriteria": [ // checked in status reports
    "Audit log entries present for all mutations"
  ],
  "reviewDimensions": [ // shown in DISCOVERY_REFINEMENT
    {
      "id": "audit-completeness",
      "label": "Audit Trail Completeness",
      "prompt": "For every mutation: is it logged with actor, action, resource, from-value, to-value, timestamp?",
      "evidenceRequired": true,
      "scope": "data" // "all" | "ui" | "api" | "data" | "migration"
    }
  ]
}
```

**Required fields:** `id`, `name`, `description`, `extras`, `specSections`,
`reminders`, `acceptanceCriteria`.

**Optional fields:** `reviewDimensions`, `registries`, `dreamStatePrompt`, and a
`scope` on each reminder and spec section.

#### Question IDs for `extras`

The 6 base discovery questions accept extras via `questionId`:

| questionId       | Question                                           |
| ---------------- | -------------------------------------------------- |
| `status_quo`     | What does the user do today without this feature?  |
| `ambition`       | Describe the 1-star and 10-star versions.          |
| `reversibility`  | Does this change involve an irreversible decision? |
| `user_impact`    | Does this change affect existing users' behavior?  |
| `verification`   | How do you verify this works correctly?            |
| `scope_boundary` | What should this feature NOT do?                   |

#### Where content applies: `scope`

A reminder, a spec section and a review dimension can each declare where it
applies. Each scope value names one flag of the spec's `SpecClassification`,
which is set after discovery ([Spec Classification](#spec-classification)).
Content without a scope applies to every spec.

| scope value   | Spec flag              | Files the hook adds a scoped reminder for          |
| ------------- | ---------------------- | -------------------------------------------------- |
| `"ui"`        | `involvesWebUI`        | `.tsx`, `.jsx`, `.html`, `.css`, `.svelte`, `.vue` |
| `"api"`       | `involvesPublicAPI`    | `.ts`, `.go`, `.py`, `.rs`                         |
| `"data"`      | `involvesDataHandling` | every file                                         |
| `"migration"` | `involvesMigration`    | every file                                         |

Reminders are plain strings or `{ "text": "...", "scope": [...] }` objects:

- A plain string, or an object without a `scope`, is in the context of every
  DISCOVERY output and every EXECUTING instruction.
- A scoped reminder is file-specific. noskills leaves it out of the EXECUTING
  instruction (the instruction counts it in `tier2Summary`), and the PreToolUse
  hook adds it when the agent edits a file listed for one of its scope values in
  a spec whose classification has that value's flag. In DISCOVERY it is in the
  context while the spec has no classification, and afterwards only when a
  value's flag is set.

```jsonc
{
  "reminders": [
    "Every state change must be traceable", // every spec, every EXECUTING prompt
    { "text": "Every screen has an empty state", "scope": ["ui"] }, // .tsx and the other UI files, in UI specs
    { "text": "Version every public route", "scope": ["api"] }, // .ts, .go, .py and .rs files, in API specs
    { "text": "Write the down migration too", "scope": ["migration"] } // every file, in migration specs
  ]
}
```

A spec section with a `scope` is hidden until the spec is classified, then shown
while one of its values has its flag set:

```jsonc
{
  "specSections": [
    {
      "id": "retention-policy",
      "title": "Retention Policy",
      "placeholder": "_How long is each new data element kept?_",
      "scope": ["data"],
      "position": "after:acceptance-criteria"
    }
  ]
}
```

A section may still carry the older `condition` field, one flag name such as
`"involvesCLI"`; when a section has both, both must hold.

A review dimension takes a single value: `"all"` or one of the four above.

noskills checks every `scope` when it loads a concern. A concern with an unknown
value, such as `"UI"`, is skipped, and noskills prints a warning that names the
file and the entry.

Earlier versions guessed where a reminder applied from words in its text
("slop", "api doc", "migration" and others). If a project concern relied on
those words, give its reminders a `scope`. Run `noskills init` to refresh the
copies of the built-in concerns in `.eser/concerns/`; the copies written by
earlier versions have no scopes, so their UI reminders reach every spec until
you do.

#### Concern IDs appear in prompt reminders

Your `id` prefixes every reminder in the agent prompt:
`fintech-compliance: Every state change must be traceable...`. Keep IDs short
and hyphenated.

#### Tension pairs (built-in concerns only)

Built-in concerns must register at least one tension pair in
`context/concerns.ts:detectTensions`. This is enforced by a test in
`defaults/concerns/mod_test.ts`. **Adopter concerns are exempt** — the test only
checks `DEFAULT_CONCERNS`.

If you want to document a tension between your concern and a built-in, add it as
a comment in your JSON `description` field.

#### promptFile (optional, Change 1a)

When concern content grows large, move long-form markdown to a sibling file:

```
.eser/concerns/
├── 100-fintech-compliance.json
└── 100-fintech-compliance/
    └── dimensions/
        └── audit-completeness.md     # long-form prompt replaces the "prompt" string
```

Reference via `promptFile` in the dimension:
`"promptFile": "dimensions/audit-completeness.md"`. Paths resolve relative to
the concern's own JSON file.

_Note: promptFile loading requires the markdown loader (Change 1a). Until then,
keep prompts inline._

#### Common errors

| Error                                                                    | Fix                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `Failed to parse concern at .eser/concerns/100-x.json: Unexpected token` | JSON syntax error — check for trailing commas, missing quotes, unmatched braces                      |
| Concern reminders not appearing                                          | Check `id` in JSON matches the filename's `<id>` segment. Check that `reminders` array is non-empty. |
| Review dimensions not appearing                                          | `scope` mismatch — if `scope: "ui"` but spec has `involvesWebUI: false`, dimension is filtered out   |
| `noskills: WARNING — .eser/concerns/100-x.json ... scope has "UI"`       | Use a lowercase scope value: `ui`, `api`, `data` or `migration`. The concern is skipped until then.  |
| A reminder is missing from the EXECUTING prompt                          | It has a `scope`, so the PreToolUse hook adds it when the agent edits a matching file.               |
| Extras not appearing in discovery                                        | `questionId` must match exactly one of the 6 base question IDs listed above                          |

---

## Hooks

Zero-token bookkeeping. The agent doesn't know hooks exist.

| Hook                       | Event        | What it does                                                               |
| -------------------------- | ------------ | -------------------------------------------------------------------------- |
| **pre-tool-use**           | PreToolUse   | Blocks file edits outside EXECUTING, git writes and changes to `allowGit`. |
| **stop**                   | Stop         | Increments iteration, snapshots git diff.                                  |
| **post-file-write**        | PostToolUse  | Logs modified file paths.                                                  |
| **post-bash**              | PostToolUse  | Logs noskills CLI invocations.                                             |
| **post-ask-user-question** | PostToolUse  | Writes single-use confirmation token proving the agent asked the user.     |
| **session-start**          | SessionStart | Gives the agent the `noskills next` output. Puts the git wrapper on PATH.  |

Hooks are CLI subcommands (`noskills invoke-hook <name>`), not generated script
files.

Claude Code, Codex, Copilot CLI, Kiro and the OpenCode plugin each send the hook
their own payload: `tool_name` and `tool_input`, or Copilot CLI's camelCase
`toolName` and `toolArgs`, with each tool's own tool names and input fields.
pre-tool-use, post-file-write and post-bash map them to a shell command or the
files a call changes before they decide anything (`toolCallOf` in
`commands/hook-decisions.ts`, which cites each tool's documentation). A
pre-tool-use denial exits with code 2 and the reason on stderr, which each of
these tools takes as a denial; stdout carries the same denial as JSON for the
tools that read one. Every config gives pre-tool-use 30 seconds, a limit set for
commands that start noskills through npx and may wait on the npm registry. The
Go binary (`cmd/noskills`) runs the same hooks in a few milliseconds without the
network, so the limit is not needed when the hooks call it; `noskills init` run
through the binary makes them call it.
[The PreToolUse hook in each tool](./README.md#the-pretooluse-hook-in-each-tool)
in the README lists the configs, the guarded tools and the gaps.

session-start prints the compiled `noskills next` output as
`hookSpecificOutput.additionalContext`, the field Claude Code and Codex add to
the agent's context. Copilot CLI's config runs it with `--tool=copilot-cli`,
which prints a top-level `additionalContext`, the field Copilot CLI reads.
Claude Code does not always run the SessionStart hook for a new conversation, or
add its output to the context
([anthropics/claude-code#10373](https://github.com/anthropics/claude-code/issues/10373),
open on 2026-10-05). The generated CLAUDE.md therefore also tells the agent to
call `next` at the start of a conversation, and running `/clear` starts the hook
again.

While `allowGit` is false, session-start writes the git wrapper to
`.eser/.state/bin/git`. In Claude Code it also adds that directory to the front
of PATH through `CLAUDE_ENV_FILE`; other tools need it on PATH when they start.
The wrapper calls `noskills invoke-hook git-exec <git arguments>` for every git
command it does not run directly; that check refuses pushes, and other writes to
the project's repository, and has 30 seconds to answer before the wrapper
refuses the command. pre-tool-use refuses agent changes to the `noskills`
section of `.eser/manifest.yml` and to `.eser/.state/bin/` in every phase.
[Behavioral Guardrails](./README.md#behavioral-guardrails) in the README lists
what these checks allow and where they stop.

### AskUserQuestion confirmation tokens

noskills records which discovery questions the agent asked you through
AskUserQuestion. When an agent calls the `AskUserQuestion` tool, a `PostToolUse`
hook (`noskills invoke-hook post-ask-user-question`) writes a token to
`.eser/.state/progresses/ask-token.json` with the spec name, a timestamp, and
one step per asked question: its step id and match quality.

While discovery collects the base answers, each asked question goes to the open
base question it shares the most words with, or, sharing none, to the first open
one left. A second call adds its steps to those of the first, since the six
questions take two calls. A question asked at any other point is recorded as
`discovery`, `refinement` or `approval`, steps no base answer takes.

When the agent later submits answers via `noskills next --answer`, the consumer
validates the token:

- **Spec match**: the token's spec must equal the current activeSpec
- **Step match**: each answer takes the step named after its question id
  (`status_quo` to `scope_boundary`); a revised answer in refinement takes
  `refinement`
- **Expiry**: tokens older than 30 minutes are rejected
- **Single use**: a taken step is removed, and the file goes once no step is
  left

If no step matches, the answer is marked `source: "INFERRED"` rather than
`"STATED"`. When answers that arrive together in one JSON object include one
without a step, noskills sets `batchSubmitted`, and REFINEMENT asks you to
confirm each answer on its own (Jidoka C1). Answers that bypass AskUserQuestion
entirely get no token at all and default to INFERRED.

**Behavioral platforms** (Cursor, Windsurf, Copilot) do not support PostToolUse
hooks. On those platforms, all answers default to INFERRED and REFINEMENT always
shows them for confirmation. This is the safe default.

The token's match quality is `exact` when the question the agent asked shares at
least 70% of its words with the built-in discovery question (the Jaccard index
over words longer than two letters), and `modified` when the agent rephrased it
or the step has no built-in question (refinement, approval). The answer keeps it
as `questionMatch`.

---

## Verification Backpressure

1. **Automated verification** — runs `verifyCommand` (e.g., `deno test`). Fail =
   task rejected.
2. **Status report** — agent reports against acceptance criteria from spec +
   concerns.
3. **Debt carry-forward** — remaining items persist across iterations with
   increasing urgency. 3+ iterations unaddressed = escalation.

---

## Jidoka Enforcement

noskills implements the Jidoka principle — "automation with a human touch." The
system runs autonomously but stops at every meaningful decision point.

### Enforcement Summary

| Safeguard                                           | Mechanism                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| File edits blocked in DISCOVERY/REFINEMENT/PROPOSAL | PreToolUse hook denies each tool's file tools                    |
| File edits blocked when phase is UNKNOWN            | Default-deny (Jidoka C4)                                         |
| Git write commands blocked                          | PreToolUse hook denies git commit/push/checkout                  |
| Short discovery answers rejected                    | 20-char minimum (Jidoka I1)                                      |
| Empty premises rejected                             | Must provide at least 1 premise (Jidoka M3)                      |
| Unasked batch answers flagged                       | `batchSubmitted` flag triggers stronger confirmation (Jidoka C1) |
| Pending follow-ups block discovery completion       | Must answer or skip before transitioning (Jidoka I2)             |
| Done requires status report                         | Blocks if `awaitingStatusReport` is true (Jidoka C2)             |
| High confidence needs evidence                      | Confidence >= 7 requires basis >= 10 chars (Jidoka M2)           |
| Reset restricted to terminal phases                 | Only IDLE/EXECUTING/BLOCKED/COMPLETED can reset (Jidoka I7)      |
| Concern tensions block execution                    | Must get user resolution before proceeding (Jidoka I6)           |
| Stale diagrams block completion                     | Flagged as mandatory ACs (Jidoka M4)                             |
| Enforcement level self-reported                     | `meta.enforcement` in every output (Jidoka C3)                   |
| Verification required after every task              | Mandatory behavioral rule (Jidoka I3)                            |
| Scope violations flagged in AC                      | File scope check when task declares files (Jidoka I4)            |
| Learning prompt at completion                       | `learningsPending` flag visible (Jidoka M1)                      |

### Platform Enforcement Levels

| Platform                                            | Level          | Capabilities                                                             |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Claude Code, Kiro, Codex CLI, Copilot CLI, OpenCode | **Enforced**   | PreToolUse gate, git guard, iteration tracking, file logging, sub-agents |
| Cursor, Windsurf, Copilot                           | **Behavioral** | Rules synced but not enforced — agent can bypass                         |

On behavioral platforms, `meta.enforcement.gaps` lists what's missing. The agent
self-reports its enforcement level so the user knows the compliance posture.

---

## Tool Sync

Write rules once in `.eser/rules/`. `noskills init` generates files for every
tool:

```
.eser/ (single source of truth)
├── → CLAUDE.md                        (Claude Code)
├── → AGENTS.md                        (Codex / Copilot / OpenCode)
├── → .claude/settings.json            (hooks)
├── → .kiro/steering/*.md              (Kiro)
├── → .kiro/hooks/noskills.json        (Kiro hooks)
├── → .codex/hooks.json                (Codex CLI)
├── → .github/hooks/noskills.json      (Copilot CLI)
├── → .opencode/plugins/noskills.ts    (OpenCode)
├── → .github/copilot-instructions.md  (Copilot)
├── → .cursorrules                     (Cursor)
└── → .windsurfrules                   (Windsurf)
```

Cursor, Windsurf and Copilot run no noskills hooks, so their file is the only
instruction they get. All three files hold the same text, built in
`sync/rule-file.ts`, and every command in it carries `spec <name>`: once a spec
is active, `next` refuses a call without the spec name.

---

## Spec Management

```bash
noskills spec new "photo upload feature"           # auto-slug
noskills spec new --name=SPC0001 "description"     # explicit name
noskills spec list                                  # all specs with status
noskills spec upload section list                   # sections the completeness gate checks
noskills spec upload section summary fill "text"    # fill a section with the user's answer
noskills spec upload section tasks na "reason"      # mark a section N/A (reason of 20+ chars)
noskills spec upload revisit "scope changed"        # EXECUTING → DISCOVERY, progress preserved
noskills spec upload split --into x --into y        # split into sub-specs
```

Multiple specs can exist at different stages. Switching preserves everything.

A split, through `split --into` or the answer `split` during discovery review,
cancels the parent and starts each child in discovery review. With `--into` (at
least two), every child starts with all of the parent's answers. Without it, the
children are the areas the split detector found, and each starts with only the
answers its area came from. A split refuses child names that repeat or already
belong to a spec, and then creates nothing.

---

## Multi-User

```bash
noskills config set-user --from-git
noskills spec upload review              # see delegations assigned to you
noskills spec upload delegate Q3 ahmet   # delegate a question
```

Every action is attributed. Delegated items block approval until answered.

---

## Packs

Installable bundles of rules, concerns, and folder-rules:

```bash
noskills pack install typescript    # 3 rules, 1 concern
noskills pack install security      # 3 rules, 1 concern
noskills pack search                # browse available
```

Built-in: `typescript`, `react`, `security`. Remote: `github:owner/repo#name`.

A pack's concerns use the concern file format, `scope` included
([Where content applies](#where-content-applies-scope)). Installing a remote
pack stops at a concern with an unknown scope value and names the entry.

`noskills pack search` also searches a remote registry when `.eser/manifest.yml`
names one:

```yaml
noskills:
  packRegistry: "https://your_registry_host/registry.json"
```

The registry is a JSON document with a `packs` list, each entry with `name`,
`description`, `version`, `source` (`builtin`, `local` or `remote`) and optional
`tags`. The URL comes from the repository, so noskills checks it before the
request:

- It must use https; http is allowed only for a loopback host (`localhost`,
  `127.0.0.0/8` or `[::1]`).
- It must not contain a user name or password.
- An IP address host must not be private, link-local, shared, unspecified,
  multicast or reserved, in IPv4 or IPv6.

Redirects are refused, documents over 1 MiB are not read, and entries with
control characters are rejected. A host name that resolves to an internal
address is not caught; the module header of
[pack/registry.ts](./pack/registry.ts) explains why that case is allowed. A
refused or unreachable registry is reported, and the built-in packs are still
listed.

---

## Autonomous Execution

```bash
noskills run                              # spawns fresh agent per iteration
noskills run --unattended                 # stops at BLOCKED, logs to file
noskills run --max-iterations=20          # safety valve
noskills run --max-turns=15               # turns per agent process
```

Each iteration is a fresh process with zero context accumulation — the Ralph
loop pattern. State persists in files between iterations.

---

## Configuration

`.eser/manifest.yml`:

```yaml
noskills:
  command: "eser noskills"
  concerns:
    - open-source
    - beautiful-product
  tools:
    - claude-code
    - cursor
  project:
    languages: [typescript]
    frameworks: [react]
    testRunner: deno
  maxIterationsBeforeRestart: 15
  verifyCommand: "deno test"
  allowGit: false
  validate: # optional: see "The transition validator"
    agent: claude-code
    model: claude-sonnet-5
```

---

## Directory Structure

```
.eser/
├── manifest.yml               # config
├── concerns/                  # concern definitions
├── rules/                     # permanent rules (*.md)
├── specs/
│   └── photo-upload/
│       └── spec.md            # generated spec
├── learnings.jsonl            # cross-session learnings
├── diagrams.json              # diagram registry
├── .state/                    # git-ignored runtime (umbrella)
│   ├── progresses/            #   workflow state machine
│   │   ├── state.json
│   │   ├── specs/
│   │   ├── validations/       #   last validator result per spec
│   │   ├── files-changed.jsonl
│   │   └── noskills-calls.jsonl
│   ├── purge-history/         #   what noskills purge removed (5 newest)
│   ├── sessions/              #   ephemeral session bindings
│   └── events/                #   append-only audit log
│       └── events.jsonl
└── .gitignore
```

---

## CLI Reference

```bash
eser noskills <command>        # via eser CLI
eser nos <command>             # alias
```

| Command                               | Description                                       |
| ------------------------------------- | ------------------------------------------------- |
| `init`                                | Scaffold, detect tools, generate files, set hooks |
| `status`                              | Current phase, progress, debt                     |
| `spec new "description"`              | Start a new spec                                  |
| `spec list`                           | List all specs                                    |
| `spec <name> next`                    | Get instruction for current phase                 |
| `spec <name> next --answer="..."`     | Submit answer and advance                         |
| `spec <name> next --validate`         | Have a second agent check the transition          |
| `spec <name> approve`                 | Approve spec → APPROVED                           |
| `spec <name> done`                    | Complete → COMPLETED (reason: done)               |
| `spec <name> cancel`                  | Cancel spec → COMPLETED (reason: cancelled)       |
| `spec <name> wontfix`                 | Close as won't fix → COMPLETED (reason: wontfix)  |
| `spec <name> block "reason"`          | Mark as blocked                                   |
| `spec <name> reset`                   | Reset to IDLE                                     |
| `spec <name> reopen`                  | COMPLETED → DISCOVERY (re-scope a finished spec)  |
| `spec <name> revisit "reason"`        | EXECUTING/BLOCKED → DISCOVERY with progress       |
| `spec <name> section list`            | Sections the completeness gate checks             |
| `spec <name> section <id> fill "..."` | Fill a section in DISCOVERY or REFINEMENT         |
| `spec <name> section <id> na "..."`   | Mark a section N/A with a reason                  |
| `spec <name> review`                  | See delegations assigned to you                   |
| `spec <name> followup <qId> "text"`   | Add adaptive follow-up question                   |
| `spec <name> followup <id> --answer=` | Answer a pending follow-up                        |
| `spec <name> followup <id> --skip`    | Skip a pending follow-up                          |
| `spec <name> learn "text"`            | Record a learning                                 |
| `spec <name> learn "text" --rule`     | Record as permanent project rule                  |
| `run [--unattended]`                  | Autonomous execution loop                         |
| `watch`                               | Live terminal dashboard                           |
| `web [--port=N]`                      | Web dashboard (same experience as TUI)            |
| `manager`                             | TUI manager with embedded Claude Code tabs        |
| `concern add/remove/list`             | Manage concerns                                   |
| `rule add/list`                       | Manage rules                                      |
| `learn list/remove/promote`           | Manage learnings                                  |
| `pack install/uninstall/list/search`  | Manage packs                                      |
| `diagrams scan/list/check/verify`     | Diagram staleness audit                           |
| `config set-user/get-user/clear-user` | User identity                                     |
| `purge [--force] [--no-history]`      | Remove noskills content, keeping a copy           |
| `purge restore [entry_id] [category]` | List the purge history or restore from an entry   |

---

## Library API

The package root (`@eserstack/noskills`) is the CLI entry point; the library
lives under `@eserstack/noskills/mod`. This example reads the project's
manifest, starts a spec and compiles the instruction an agent would receive:

```typescript
import * as noskills from "@eserstack/noskills/mod";

const { root } = await noskills.persistence.resolveProjectRoot();
const config = await noskills.persistence.readManifest(root);
const allConcerns = await noskills.concerns.loadDefaultConcerns();
const activeConcerns = allConcerns.filter((c) =>
  config?.concerns.includes(c.id) === true
);

const state = noskills.machine.startSpec(
  noskills.createInitialState(),
  "my-feature",
  "spec/my-feature",
);

const qs = noskills.questions.getQuestionsWithExtras(activeConcerns);
const output = await noskills.compiler.compile(
  state,
  activeConcerns,
  [],
  config,
);
const tensions = noskills.concerns.detectTensions(activeConcerns);
const dimensions = noskills.concerns.getReviewDimensions(activeConcerns);
const registries = noskills.concerns.getRegistryDimensionIds(activeConcerns);
const text = noskills.formatter.format(output, "markdown");
```

A concern's `reminders` hold plain strings and `{ text, scope }` objects. Read
either shape with `noskills.concerns.reminderText(reminder)` and
`noskills.concerns.reminderScope(reminder)`:

```typescript
import * as noskills from "@eserstack/noskills/mod";

const concerns = await noskills.concerns.loadDefaultConcerns();
const uiReminders = concerns.flatMap((concern) => concern.reminders)
  .filter((reminder) =>
    noskills.concerns.reminderScope(reminder).includes("ui")
  )
  .map((reminder) => noskills.concerns.reminderText(reminder));
```

### Dashboard API

The dashboard functions are on the same entry point, under `dashboard`:

```typescript
import * as noskills from "@eserstack/noskills/mod";

const { root } = await noskills.persistence.resolveProjectRoot();
const user = { name: "your_name", email: "your_email" };

const state = await noskills.dashboard.getState(root);
const unsubscribe = noskills.dashboard.watchEvents(root, (event) => {
  console.log(event.type, event.spec);
});
await noskills.dashboard.approve(root, "upload", user);
await noskills.dashboard.addNote(root, "upload", "Is VAT included?", user);
unsubscribe();
```

---

## Platform Details

### Behavioral Guardrails per Phase

| Phase      | Tone                           | Key rules                                |
| ---------- | ------------------------------ | ---------------------------------------- |
| IDLE       | Welcoming                      | No file edits                            |
| DISCOVERY  | Curious, has a stake           | Push back on shallow answers, don't code |
| REFINEMENT | Careful reviewer               | User must confirm each answer            |
| PROPOSAL   | The user is reviewing          | Don't modify spec, don't code            |
| APPROVED   | Patient, wait for go signal    | Don't start coding until user says go    |
| EXECUTING  | Orchestrate — spawn sub-agents | Delegate, don't edit directly            |
| BLOCKED    | Brief, decision time           | Present as-is, no preferences            |
| COMPLETED  | Celebrate briefly, then stop   | Don't start new work, record learnings   |

### Scoped Folder Rules

Drop `.folder-rules.md` in any directory:

```markdown
- Sync output must be idempotent
- Hook scripts must be self-contained
```

Rules stack upward like CSS specificity. When the agent modifies files in that
directory, the rules become acceptance criteria.

### Decision Lifecycle

1. Agent encounters decision → `noskills block`
2. Human answers
3. noskills asks: permanent rule or just this spec?
4. Permanent → `.eser/rules/` → synced to all tools
5. One-time → recorded in spec's decisions table only

### Confidence Scoring

Every agent finding includes a confidence score (1-10):

- 9-10: Verified — read the code
- 7-8: Strong evidence
- 5-6: Reasonable inference
- 3-4: Guess
- 1-2: Speculation

Findings below 5 are prefixed with ⚠ Unverified.

### Init Detection

`noskills init` auto-detects: languages, frameworks, CI, test runner, and coding
tools (Claude Code, Kiro, Codex CLI, Copilot CLI, OpenCode, Cursor, Windsurf,
Cline, Roo Code, Kilo Code).

---

## Agent Bridge

`commands/run.ts` resolves an agent through `@eserstack/ai`:
`adapters.factoryFor("claude-code")`, after `iteration.setDriver(root, "acp")`
records which driver the run used.

`factoryFor` prefers the ACP-backed Go bridge when the native library loads, and
falls back to the TypeScript adapter otherwise. Both drive the same vendor
binary in the same non-interactive mode, so the choice affects transport, not
behaviour. If no agent can be resolved, `noskills run` reports that it could not
run the agent and stops.

There is no longer a `bridge/` module or a `claude -p` shell-out — that chain
was removed when ACP replaced it.

---

## The Scrum Analogy

| Agile / Scrum      | noskills                                     |
| ------------------ | -------------------------------------------- |
| User Story         | Spec                                         |
| Refinement         | Discovery (6 questions + concerns)           |
| Sprint Planning    | Spec draft → approval                        |
| Sprint             | Execution (runs until spec done)             |
| Dev team           | Sub-agents (executor, verifier, test-writer) |
| Scrum Master       | noskills (state machine + hooks)             |
| Definition of Done | Acceptance criteria                          |
| Sprint Review      | AC status report + verifier                  |
| Retrospective      | Learnings + debt tracking                    |
| Product Owner      | You                                          |

One difference: in Scrum, sprints are time-boxed. In noskills, execution runs
until the spec is complete — a single-story sprint. If the story is too big,
split it before execution starts.

---

## License

Apache-2.0
