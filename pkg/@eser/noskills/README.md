# [@eser/noskills](./)

State-machine orchestrator for AI coding agents. Instead of loading skills into
context and hoping the agent picks the right one, noskills pushes exactly the
right instruction at the right time — the agent never decides what to do next,
the state machine does.

## Why

AI coding agents have a context rot problem. The more skills, rules, and
conventions you load upfront, the worse the agent performs — its context window
fills with instructions it doesn't need yet, and it forgets the ones it does.

Skills are a "pull" model: the agent decides which skill to load. This creates
two failure modes — picking the wrong skill (wasted context) and needing
meta-knowledge to pick the right one (more context to waste).

noskills is a "push" model:

```
Agent <- stdout (JSON) <- noskills CLI <- filesystem (state + concerns + rules)
```

The agent calls `noskills next`, gets exactly what it needs for the current
phase, acts on it, and calls `noskills next` again. No skill selection, no
context pollution, no forgetting.

## The Mental Model

```
.cursorrules -> .cursor/rules/*.mdc -> eser/rules + skills -> noskills
  (1 file)      (modular, 1 tool)    (portable, curated)   (state-driven)
```

Each generation solved one bottleneck and discovered the next:

1. **`.cursorrules`** — single file, single tool. Couldn't split, couldn't
   scale, couldn't travel across tools.
2. **`.cursor/rules/*.mdc`** — modular, but still locked to Cursor.
3. **`eser/rules` + `eser-rules-manager`** — created as a portable,
   tool-agnostic instruction system. This **predated** Anthropic's Skills spec.
   When Skills arrived, eser/rules was adapted into skills format — validating
   the ecosystem was heading where eser/rules had already gone.
4. **noskills** — Skills brought new limits: context rot as skills accumulated,
   agents making wrong skill choices, manual sync across tools. noskills drops
   skills entirely in favor of state-driven context injection.

The `eser/rules` repository
([github.com/eser/rules](https://github.com/eser/rules)) is now archived. Its
ideas live on in noskills, refined under
[github.com/eser/stack](https://github.com/eser/stack).

This is the **Software³** philosophy: build, discover limits, evolve, share.
noskills will discover its own limits too — and when it does, the next step will
emerge. If you want to discover those limits together, jump on board.

The name mirrors the SQL -> NoSQL shift: skills define everything upfront,
noskills determines what's needed at runtime.

## Getting Started with Claude Code

Open Claude Code and paste:

```
npx eser noskills init
```

That's it. After init, run `npx eser noskills next` — it will tell you what to
do from here. Every step, every decision, every task — always check with
noskills first.

If you want to add this to an existing project where teammates also use
noskills, the init scaffolds `.eser/` which should be committed to your repo.

## Quick Start

### With an agent (Claude Code, Cursor, etc.)

```bash
eser noskills init                          # Scaffold .eser/, detect tools
eser noskills concern add open-source       # Activate concerns
eser noskills spec new "photo upload"       # Start spec -> DISCOVERY
# Agent takes over: calls noskills next, answers questions,
# builds to spec, reports progress. You approve transitions.
```

After `init`, your CLAUDE.md (or .cursorrules, etc.) tells the agent to call
`noskills next` at every step. The agent follows the JSON output. You never need
to prompt-engineer the agent's behavior — noskills handles that.

### Without an agent (agentless CLI mode)

```bash
eser noskills init
eser noskills concern add beautiful-product
eser noskills spec new "photo upload"
eser noskills next -o text                  # Shows Q1 in plain text
eser noskills next --answer="users drag files manually" -o text
eser noskills next -o text                  # Shows Q2
# ... answer all 6 questions ...
eser noskills approve
eser noskills next --answer="start" -o text # Begin execution
eser noskills next --answer="task-1 done" -o text
# noskills asks for status report against acceptance criteria
eser noskills next --answer='{"completed":["endpoint works"],"remaining":["error UI"]}' -o text
# debt carries forward to next iteration
eser noskills status -o markdown
```

The entire lifecycle works without any agent. noskills is the orchestrator —
agents and humans are both consumers.

Both CLI and agent write to the same state. You can start discovery via CLI
(answering questions in the terminal), close the terminal, open an agent session
later, and the agent picks up from the last answered question. Or start with an
agent and finish via CLI. noskills doesn't care who's driving — it checks state
and continues from wherever it left off.

### Autonomous execution (Ralph loop)

```bash
eser noskills run                           # Spawns fresh claude -p per iteration
eser noskills run --unattended              # Stops at BLOCKED, logs to file
eser noskills run --max-iterations=20       # Safety valve
eser noskills run --max-turns=15            # Turns per agent process
```

Each iteration is a fresh `claude -p` process with zero context accumulation.
State persists in `.eser/.state/state.json` between iterations. The Stop hook
snapshots git state automatically. Verification backpressure prevents advancing
past broken tests. When `autoCommit: true` in `manifest.yml`, the `noskills run`
CLI loop handles git commits between iterations — the agent never touches git.
Git write operations are the CLI's responsibility, never the agent's.

### Live monitoring

While an agent works, open another terminal:

```bash
eser noskills watch              # Live terminal dashboard
eser noskills watch -o json      # JSON lines per state change (pipeable)
eser noskills watch -o markdown  # Markdown per update
```

The dashboard shows: active spec, phase, progress bar, iteration count, time
since last update, outstanding debt items, files changed this iteration, concern
list, and context warning. Entirely filesystem-driven — watches `.eser/.state/`
for changes. Zero LLM tokens. Exits automatically when phase reaches DONE.

## How It Works

### The State Machine

Every spec follows a deterministic phase flow:

```
IDLE -> DISCOVERY -> SPEC_DRAFT -> SPEC_APPROVED -> EXECUTING <-> BLOCKED
 ^                                                       |
 +------------------------- DONE <-----------------------+
```

| Phase             | What happens                                                           |
| ----------------- | ---------------------------------------------------------------------- |
| **IDLE**          | No active spec. Start one with `noskills spec new "..."`               |
| **DISCOVERY**     | 6 blended questions probe product, engineering, and QA simultaneously  |
| **SPEC_DRAFT**    | Spec generated from discovery answers. Human reviews                   |
| **SPEC_APPROVED** | Spec approved, waiting to start. A deliberate "ready but not yet" gate |
| **EXECUTING**     | Agent works through the spec. Reports progress each iteration          |
| **BLOCKED**       | Agent hit a decision it can't make alone. Human resolves               |
| **DONE**          | Spec complete. Summary with iteration count and decisions              |

### Phase Transition Protocol

Every phase transition follows the same structured cycle:

```
Human input -> Agent A evaluates -> Agent B validates (optional) -> Human approves -> Next phase
```

This is universal — DISCOVERY -> SPEC_DRAFT, SPEC_DRAFT -> SPEC_APPROVED,
BLOCKED -> EXECUTING, every transition. The human always has final say.

Agent B validation is opt-in per command (`noskills next --validate`) or as a
project default in `manifest.yml`. When validation is active, noskills spawns
Agent B via the Agent Bridge with completely isolated context — Agent B never
sees Agent A's conversation history. This is real generator/judge separation,
not role-played.

### The JSON Output

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
    "resumeHint": "Executing \"photo-upload\", iteration 3. Last progress: implemented auth module. Continue with the current task."
  },
  "behavioral": {
    "rules": [
      "NEVER run git write commands. Git is read-only for agents.",
      "Do not explore the codebase beyond what the current task requires.",
      "Do not refactor, improve, or modify code outside this task's scope.",
      "Complete the task, then report progress. The user handles git."
    ],
    "tone": "Direct. No preamble. Start coding immediately."
  },
  "context": {
    "rules": ["Use Deno for all TypeScript"],
    "concernReminders": [
      "open-source: Endpoint should be documented in API docs",
      "beautiful-product: Loading and error states must be designed, not placeholder"
    ]
  },
  "transition": {
    "onComplete": "eser noskills next --answer=\"...\"",
    "onBlocked": "eser noskills block \"reason\"",
    "iteration": 3
  }
}
```

The `meta.resumeHint` is designed for cold starts — a fresh agent (or human)
reading the output for the first time can orient themselves without any prior
context. On stale sessions (>5 min since last call), a `protocolGuide` block
appears explaining what noskills is and how phases work.

When concerns conflict, the output includes a tension block:

```jsonc
{
  "phase": "EXECUTING",
  "concernTensions": [{
    "between": ["move-fast", "compliance"],
    "issue": "Skipping audit log saves ~2h but violates compliance concern."
  }]
}
```

Tensions require human resolution — noskills never auto-resolves them.

### Output Formats

```bash
noskills next              # JSON (default, for agents and pipes)
noskills next -o json      # Explicit JSON
noskills next -o markdown  # Human-readable with headings and checklists
noskills next -o text      # Plain text, no formatting
noskills status -o json    # Structured status for scripts
```

### Behavioral Guardrails

Every `noskills next` output includes a `behavioral` block with phase-specific
rules. These tell the agent HOW to behave, not just WHAT to do:

| Phase      | Behavioral tone                | Key rules                                                    |
| ---------- | ------------------------------ | ------------------------------------------------------------ |
| DISCOVERY  | "You are a messenger"          | Don't rephrase questions, relay answers verbatim, don't code |
| SPEC_DRAFT | "The user is reviewing"        | Don't modify the spec, don't start coding                    |
| EXECUTING  | "Start coding immediately"     | Don't explore beyond scope, don't refactor, timebox reading  |
| BLOCKED    | "Brief. Decision time."        | Present decision as-is, don't suggest preferences            |
| DONE       | "Celebrate briefly, then stop" | Don't start new work                                         |

**Git is read-only** for agents (configurable via `allowGit: true` in manifest).
Agents may read (`git log`, `git diff`, `git status`) but never write
(`git commit`, `git push`, `git checkout`). This is enforced at three levels:
behavioral rules, CLAUDE.md instruction, and PreToolUse hook.

When the agent's iteration count exceeds `maxIterationsBeforeRestart` (default
15), an `urgency` message warns that context is degrading and recommends a fresh
session.

**Convention discovery:** When the agent identifies a recurring pattern,
receives a correction from the user, or discovers a preference during work, the
behavioral rules instruct it to ask: _"Should this be a permanent rule for this
project, or just for this task?"_ If permanent, the agent runs
`noskills rule add`. If just this task, it notes and moves on. The agent never
writes to `.eser/rules/` directly — noskills handles file creation and sync.

### Concerns — The Project's DNA

Concerns define what your project IS. They stack on top of each other and affect
discovery questions, spec sections, execution reminders, and acceptance
criteria:

| Concern               | Effect                                                                |
| --------------------- | --------------------------------------------------------------------- |
| **open-source**       | Prioritize contributor experience, default to permissive choices      |
| **beautiful-product** | Every UI state specified — empty, loading, error, success. No AI slop |
| **long-lived**        | Favor boring technology, every shortcut needs justification           |
| **move-fast**         | Good enough is good enough, defer polish to v2                        |
| **compliance**        | Every state change must be traceable, verification is mandatory       |
| **learning-project**  | Experimentation encouraged, document learnings over polish            |

Concerns inject:

- **Discovery extras** — sub-questions per concern per question
- **Spec sections** — e.g., beautiful-product adds "Design States (empty,
  loading, error, success)"
- **Execution reminders** — per-iteration context hints
- **Acceptance criteria** — checked during status reports before task is
  accepted

When concerns conflict (e.g., move-fast + compliance), noskills surfaces the
tension to the human rather than resolving it silently.

### Decision Lifecycle

When an agent encounters a decision during any phase:

1. Agent reports it needs a decision (via `noskills block` or within `next`
   output).
2. noskills routes the decision to the human.
3. Human answers.
4. noskills asks: _"Should this be a permanent rule for this project, or just
   for this spec?"_
5. If permanent -> `noskills rule add` is called internally -> writes to
   `.eser/rules/` -> triggers sync.
6. If just this spec -> recorded in the spec's decisions table only.

This creates an organic growth loop: as you build specs, your rule set evolves.
New team members and AI agents automatically inherit accumulated decisions.
One-time decisions stay scoped to their spec — they never leak into other specs.

The spec file tracks decisions:

```markdown
## Decisions

| # | Decision           | Choice        | Type            |
| - | ------------------ | ------------- | --------------- |
| 1 | Validation library | Zod           | rule (promoted) |
| 2 | Image API provider | OpenAI Vision | one-time        |
```

### Verification Backpressure

When the agent reports a task complete, noskills doesn't take its word for it.

1. **Automated verification** runs first (configurable via `verifyCommand` in
   manifest, e.g., `"deno test"`). If tests fail, the task is rejected and the
   failure output is returned as the next instruction.

2. **Status report** requested against acceptance criteria — items from the spec
   plus concern-injected criteria (e.g., "All UI states designed" from
   beautiful-product). The agent checks off what's done and reports what
   remains.

3. **Debt carry-forward** — remaining items persist across iterations as debt.
   Every subsequent `noskills next` output includes the debt with "Address these
   BEFORE starting new work." Debt is never silently removed — only an explicit
   status report listing items as completed clears them. If debt items remain
   unaddressed for 3+ iterations, noskills escalates — the debt block gains an
   urgency field warning that these items have been outstanding for N iterations
   and must be addressed before any new work.

4. **Context clearing** — when debt is zero and verification passes, noskills
   emits a `clearContext` action telling the agent to `/clear` for fresh context
   on the next task. A `pendingClear` flag blocks all file edits until the agent
   complies.

### Scoped Folder Rules

In monorepos, different packages have different constraints. Drop a
`.folder-rules.md` in any directory with markdown bullet rules:

```markdown
- Generated CLAUDE.md must preserve existing content outside noskills:start/end
  markers
- All command references must use dynamic noskillsCmd prefix
- Sync output must be idempotent
- Hook scripts must be self-contained
```

When the agent modifies files in that directory (tracked via the post-file-write
hook log), noskills adds those rules to the acceptance criteria during status
reports:

```
(folder: pkg/@eser/noskills/sync) Sync output must be idempotent
(folder: pkg/@eser/noskills/sync) Hook scripts must be self-contained
```

Rules stack upward — `.folder-rules.md` files in parent directories also apply,
like CSS specificity. A rule at `pkg/` applies to all files under `pkg/`, while
a rule at `pkg/@eser/streams/` applies only to that package. Zero token cost —
derived from filesystem, not LLM.

### Discovery Questions

Six questions, each probing product + engineering + QA at once:

1. **What does the user do today without this feature?**
2. **Describe the 1-star and 10-star versions.**
3. **Does this change involve an irreversible decision?**
4. **Does this change affect existing users' behavior?**
5. **How do you verify this works correctly?**
6. **What should this feature NOT do?**

Active concerns inject sub-questions. For example, with `open-source` active,
question 1 also asks: _"Is this workaround common in the community?"_

### Spec Classification

After discovery answers are submitted, noskills asks the user to classify the
spec along four boolean axes:

| Flag                   | What it controls                                        |
| ---------------------- | ------------------------------------------------------- |
| `involvesUI`           | UI state sections from beautiful-product concern        |
| `involvesPublicAPI`    | API documentation sections from open-source concern     |
| `involvesMigration`    | Migration checklist sections from compliance/long-lived |
| `involvesDataHandling` | Data safety sections from compliance concern            |

Classification determines which concern sections appear in the generated spec.
Irrelevant sections are skipped entirely — a backend API change won't get UI
state checklists, and a CSS tweak won't get migration warnings. This replaces
keyword-based guessing with explicit user input.

The classification is submitted as JSON via `noskills next`:

```bash
noskills next --answer='{"involvesUI":true,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}'
```

### Hooks — Zero-Token Bookkeeping

noskills installs Claude Code hooks that handle state bookkeeping without
spending LLM tokens:

| Hook                | Event       | What it does                                                                                                         |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| **pre-tool-use**    | PreToolUse  | Blocks file edits outside EXECUTING phase. Blocks git write commands. Blocks edits when pendingClear is set.         |
| **stop**            | Stop        | Increments iteration counter, snapshots `git diff` into state, checks restart threshold. The Ralph loop's heartbeat. |
| **post-file-write** | PostToolUse | Logs modified file paths to `.eser/.state/files-changed.jsonl`                                                       |
| **post-bash**       | PostToolUse | Logs noskills CLI invocations for observability                                                                      |

Hooks are CLI subcommands (`noskills invoke-hook <name>`), not generated script
files. This avoids ESM/CJS issues — the same Deno entry point handles
everything.

The agent is completely unaware hooks exist. Hooks derive progress from
filesystem and git state — the agent doesn't waste tokens summarizing what it
did.

### Tool Sync — One Source of Truth

noskills generates instruction files for every AI tool your team uses:

```
.eser/ (single source of truth)
+-- noskills sync
    |-- -> CLAUDE.md          (Claude Code)
    |-- -> .cursorrules       (Cursor)
    |-- -> .kiro/steering/    (Kiro)
    |-- -> .github/copilot-instructions.md (GitHub Copilot)
    +-- -> .windsurfrules     (Windsurf)
```

Write your rules once in `.eser/rules/`, run `noskills sync`, and every tool
gets the same instructions in its native format.

Generated CLAUDE.md includes:

- Protocol instructions with 5 concrete trigger points
- Git read-only section (unless `allowGit: true`)
- Active rules
- JSON output explanation

### Spec Management

```bash
# Create with auto-generated slug
noskills spec new "photo upload feature"
# -> .eser/specs/photo-upload-feature/spec.md

# Create with explicit name
noskills spec new --name=SPC0001 "photo upload feature"
# -> .eser/specs/SPC0001/spec.md

# List all specs with status
noskills spec list
# . photo-upload-feature   EXECUTING   iteration 3
#   fix-login-bug          SPEC_DRAFT
#   SPC0001                DONE

# Switch between specs (preserves state)
noskills spec switch fix-login-bug
# Active spec: fix-login-bug (SPEC_DRAFT)

# JSON output for scripts
noskills spec list -o json
```

Multiple specs can exist at different stages. Switching away from an EXECUTING
spec preserves everything — iteration, debt, verification result, progress.
Switching back resumes exactly where it left off.

## CLI Reference

```bash
# Via eser CLI
eser noskills <command>

# Standalone
deno run --allow-all jsr:@eser/noskills <command>

# Alias
eser nos <command>
```

### Commands

| Command                       | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| `init`                        | Scaffold `.eser/`, detect project traits, install hooks            |
| `status [-o format]`          | Show current phase, spec name, progress, debt                      |
| `spec new "..." [--name=N]`   | Start a new spec, enter DISCOVERY                                  |
| `spec list [-o format]`       | List all specs with phase info                                     |
| `spec switch <name>`          | Switch active spec (preserves state)                               |
| `next [-o format]`            | Get instruction for current phase                                  |
| `next --answer="..."  [-o f]` | Submit answer and advance state                                    |
| `approve`                     | Approve spec draft -> SPEC_APPROVED                                |
| `done`                        | Complete execution -> DONE                                         |
| `block "reason"`              | Mark execution as blocked                                          |
| `reset`                       | Reset current spec to IDLE                                         |
| `run [--unattended]`          | Autonomous execution loop (Ralph loop)                             |
| `watch [-o format]`           | Live dashboard monitoring agent progress                           |
| `concern add/remove/list`     | Manage active concerns                                             |
| `rule add/list/promote`       | Manage permanent rules                                             |
| `sync`                        | Regenerate tool-specific instruction files + hooks                 |
| `purge [--force]`             | Remove all noskills content (specs, rules, concerns, hooks, state) |

### Output Formats

All commands that produce output support `-o` / `--output`:

| Format   | Flag                | Use case               |
| -------- | ------------------- | ---------------------- |
| JSON     | `-o json` (default) | Agents, pipes, scripts |
| Markdown | `-o markdown`       | Human reading          |
| Text     | `-o text`           | Simple terminal output |

## Configuration

noskills config lives inside `.eser/manifest.yml` as a `noskills:` section:

```yaml
noskills:
  command: "eser noskills" # auto-detected during init
  concerns:
    - open-source
    - beautiful-product
  tools:
    - claude-code
    - cursor
  providers:
    - anthropic
  project:
    languages: [typescript]
    frameworks: [react]
    ci: [github-actions]
    testRunner: deno
  maxIterationsBeforeRestart: 15
  verifyCommand: "deno test" # runs before accepting task completion
  allowGit: false # true = agents can run git write commands
```

During `init`, noskills detects how it was invoked (via `@eser/standards`
runtime) and stores it as `command`. All generated output — `CLAUDE.md`
instructions, hook remediation messages, behavioral rules, transition hints —
uses this prefix. Users who invoke via `deno run`, `npx`, homebrew, or global
install all get correct command references.

**Tools vs Providers:**

- **Tools** = the IDE or agent environment (`claude-code`, `cursor`, `kiro`,
  `copilot`, `windsurf`). Affects which sync output files are generated.
- **Providers** = AI model access methods (`anthropic`, `openai`, `ollama`,
  `claude-code` CLI). Used by the Agent Bridge for validation and
  `noskills run`.

## Directory Structure

```
.eser/                           # unified toolchain directory
|-- manifest.yml                 # workflows, scripts, AND noskills config
|-- concerns/                    # Concern definitions (built-in + custom)
|   |-- 001-open-source.json
|   |-- 002-beautiful-product.json
|   +-- ...                      # Numeric prefixes control ordering
|-- rules/                       # Permanent rules (*.md, *.txt)
|-- specs/
|   +-- photo-upload/
|       +-- spec.md              # Generated spec from discovery
|-- workflows/
|-- .state/                      # git-ignored (runtime only)
|   |-- state.json               # Current phase, answers, progress, active spec
|   |-- specs/                   # Per-spec state snapshots
|   |   |-- photo-upload.json
|   |   +-- fix-login-bug.json
|   |-- files-changed.jsonl      # File modification log (from hooks)
|   +-- noskills-calls.jsonl     # CLI invocation log (from hooks)
+-- .gitignore                   # Excludes .state/
```

Configuration and specs are git-tracked for PR review. Runtime state is
gitignored — each agent session reads fresh state from the filesystem.

## Library API

```typescript
import * as noskills from "@eser/noskills/mod";

// State machine
const state = noskills.machine.startSpec(
  noskills.createInitialState(),
  "my-feature",
  "spec/my-feature",
);

// Questions with concern extras
const qs = noskills.questions.getQuestionsWithExtras(activeConcerns);

// Compile instruction for current phase
const output = noskills.compiler.compile(state, activeConcerns, rules, config);

// Concern tension detection
const tensions = noskills.concerns.detectTensions(activeConcerns);

// Output formatting
const text = noskills.formatter.format(output, "markdown");
```

## Agent Bridge

noskills can call AI agents for validation via a fallback chain:

1. **@eser/ai** — Programmatic API call (cross-model, configurable)
2. **Claude CLI** — Spawns `claude -p "..."` locally (zero additional cost)
3. **Manual** — Returns null, caller handles human review

## Init Detection

`noskills init` auto-detects:

- **Languages** — TypeScript, Go, Rust, Python (from config files)
- **Frameworks** — React, Vue, Svelte, Next.js, Express, Hono (from
  package.json)
- **CI** — GitHub Actions, GitLab CI, Jenkins, CircleCI
- **Test runner** — Deno, Vitest, Jest, Playwright
- **Coding tools** — Claude Code, Cursor, Kiro, Copilot, Windsurf (from existing
  config files in repo)

Detected coding tools are auto-synced on init, including hook installation for
Claude Code. Invocation method is auto-detected and stored in `manifest.yml` as
`noskills.command` — all output references use this prefix.

## License

Apache-2.0
