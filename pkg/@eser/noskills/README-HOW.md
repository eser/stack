# [@eser/noskills](./) — Technical Reference

This document covers the internals: state machine, hooks, compiler, CLI, API,
concerns, and configuration. For the overview and getting started, see
[README.md](./README.md).

---

## Table of Contents

- [The State Machine](#the-state-machine)
- [The JSON Output](#the-json-output)
- [Discovery](#discovery)
- [Concerns](#concerns)
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

```
Human input -> Agent A evaluates -> Agent B validates (optional) -> Human approves -> Next phase
```

Agent B validation is opt-in per command (`noskills next --validate`) or as a
project default in `manifest.yml`. When active, Agent B gets completely isolated
context — real generator/judge separation, not role-played.

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

### Adaptive Follow-ups

After each answer, noskills evaluates whether follow-ups are needed. If you
mention a specific technology, it asks about error handling. If you're vague, it
pushes for specifics. Max 3 follow-ups per question, depth 1.

```bash
noskills spec upload followup Q3 "What's the reconnection strategy?"
noskills spec upload followup Q3a --answer="Exponential backoff"
noskills spec upload followup Q3a --skip
```

### Premise Challenge

Before Q1, noskills challenges the spec's premises: Is this the right problem?
What happens if we do nothing? What existing code already solves part of this?

### Alternatives Generation

After discovery is approved, noskills prompts for 2-3 implementation approaches
before generating the spec. You pick one or skip.

### Rich Description Pre-fill

Descriptions >500 chars or plan files (`--from-plan`) get pre-filled answers
marked as [STATED] (your words) or [INFERRED] (agent's interpretation).

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
gets reminders and ACs. Zero upfront dump.

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
      "scope": "all" // "all" | "ui" | "api" | "data"
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

---

## Hooks

Zero-token bookkeeping. The agent doesn't know hooks exist.

| Hook                | Event        | What it does                                            |
| ------------------- | ------------ | ------------------------------------------------------- |
| **pre-tool-use**    | PreToolUse   | Blocks file edits outside EXECUTING. Blocks git writes. |
| **stop**            | Stop         | Increments iteration, snapshots git diff.               |
| **post-file-write** | PostToolUse  | Logs modified file paths.                               |
| **post-bash**       | PostToolUse  | Logs noskills CLI invocations.                          |
| **session-start**   | SessionStart | Runs `noskills next` so the agent is oriented.          |

Hooks are CLI subcommands (`noskills invoke-hook <name>`), not generated script
files.

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
| File edits blocked in DISCOVERY/REFINEMENT/PROPOSAL | PreToolUse hook denies Write/Edit/MultiEdit                      |
| File edits blocked when phase is UNKNOWN            | Default-deny (Jidoka C4)                                         |
| Git write commands blocked                          | PreToolUse hook denies git commit/push/checkout                  |
| Short discovery answers rejected                    | 20-char minimum (Jidoka I1)                                      |
| Empty premises rejected                             | Must provide at least 1 premise (Jidoka M3)                      |
| Batch answers flagged                               | `batchSubmitted` flag triggers stronger confirmation (Jidoka C1) |
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

| Platform                               | Level          | Capabilities                                                             |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Claude Code, Kiro, Codex CLI, OpenCode | **Enforced**   | PreToolUse gate, git guard, iteration tracking, file logging, sub-agents |
| Cursor, Windsurf, Copilot              | **Behavioral** | Rules synced but not enforced — agent can bypass                         |

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
├── → .kiro/settings/hooks.json        (Kiro hooks)
├── → .codex/hooks.json                (Codex CLI)
├── → .github/hooks/noskills.json      (Copilot CLI)
├── → .cursorrules                     (Cursor)
└── → .windsurfrules                   (Windsurf)
```

---

## Spec Management

```bash
noskills spec new "photo upload feature"           # auto-slug
noskills spec new --name=SPC0001 "description"     # explicit name
noskills spec list                                  # all specs with status
noskills spec upload revisit "scope changed"        # EXECUTING → DISCOVERY, progress preserved
noskills spec upload split --into x --into y        # split into sub-specs
```

Multiple specs can exist at different stages. Switching preserves everything.

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
├── .state/                    # git-ignored runtime
│   ├── state.json
│   ├── specs/
│   ├── files-changed.jsonl
│   └── noskills-calls.jsonl
├── .events/                   # git-ignored event log
│   └── events.jsonl
├── .sessions/                 # git-ignored session bindings
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
| `spec <name> approve`                 | Approve spec → APPROVED                           |
| `spec <name> done`                    | Complete → COMPLETED (reason: done)               |
| `spec <name> cancel`                  | Cancel spec → COMPLETED (reason: cancelled)       |
| `spec <name> wontfix`                 | Close as won't fix → COMPLETED (reason: wontfix)  |
| `spec <name> block "reason"`          | Mark as blocked                                   |
| `spec <name> reset`                   | Reset to IDLE                                     |
| `spec <name> reopen`                  | COMPLETED → DISCOVERY (re-scope a finished spec)  |
| `spec <name> revisit "reason"`        | EXECUTING/BLOCKED → DISCOVERY with progress       |
| `spec <name> review`                  | See delegations assigned to you                   |
| `spec <name> followup <qId> "text"`   | Add adaptive follow-up question                   |
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

---

## Library API

```typescript
import * as noskills from "@eser/noskills/mod";

const state = noskills.machine.startSpec(
  noskills.createInitialState(),
  "my-feature",
  "spec/my-feature",
);

const qs = noskills.questions.getQuestionsWithExtras(activeConcerns);
const output = noskills.compiler.compile(state, activeConcerns, rules, config);
const tensions = noskills.concerns.detectTensions(activeConcerns);
const dimensions = noskills.concerns.getReviewDimensions(activeConcerns);
const registries = noskills.concerns.getRegistryDimensionIds(activeConcerns);
const text = noskills.formatter.format(output, "markdown");
```

### Dashboard API

```typescript
import * as dashboard from "@eser/noskills/dashboard";

const state = await dashboard.getState(projectRoot);
const unsub = dashboard.watchEvents(projectRoot, (event) => { ... });
await dashboard.approve(projectRoot, "upload", user);
await dashboard.addNote(projectRoot, "upload", "KDV dahil mi?", user);
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

Validation via fallback chain:

1. **@eser/ai** — programmatic API call (cross-model)
2. **Claude CLI** — spawns `claude -p "..."` locally
3. **Manual** — returns null, caller handles human review

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
