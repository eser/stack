# [@eser/noskills](./)

State-machine orchestrator for AI coding agents. Instead of loading skills into
context and hoping the agent picks the right one, noskills pushes exactly the
right instruction at the right time — the agent never decides what to do next,
the state machine does.

## Status: Beta

noskills is in active beta. We've battle-tested it with Claude Code — the
discovery flow, sub-agent orchestration, verification backpressure, and the full
spec lifecycle are working in production use. Kiro has full integration
(steering files, hooks, custom agents, spec projection, MCP registration) but
needs end-to-end testing. Other platforms (Cursor, Copilot, Windsurf) have rule
sync support.

If you want to test noskills with a platform other than Claude Code, reach out —
we'd love early feedback. Find me at [github.com/eser](https://github.com/eser)
or [@eserozvataf](https://x.com/eserozvataf).

**Coming next:** deeper rule management, concern customization, and richer
integrations for Cursor, Copilot, and Windsurf. Star the repo and watch for
updates.

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

## Before & After

**Without noskills:**

```
You: "Add photo upload with validation"
Agent: *reads 17 skill files into context*
Agent: *picks wrong skill, starts building auth instead*
Agent: "I've implemented a comprehensive authentication system..."
You: "No, photo UPLOAD"
Agent: *context is now 60% full with auth code it wrote*
Agent: *starts photo upload but forgets validation requirement*
Agent: "Done! Photo upload is working."
You: *tests* "There's no validation. And you deleted my error handler."
Agent: "I apologize, let me fix that..."
Agent: *context window full, compaction happens*
Agent: *forgets everything, starts from scratch*
```

**With noskills:**

```
You: "Add photo upload with validation"
noskills: Discovery Q1/6: "What do users do today without this?"
You: "They fill forms manually, it's slow"
noskills: Q2/6: "1-star and 10-star versions?"
You: "1-star: basic upload. 10-star: auto-detect from photo"
... 4 more questions ...
noskills: "Here's your spec. 5 tasks. Approve?"
You: "Approved"
noskills -> Agent: "Task 1: Create upload endpoint. Acceptance: returns 200 for JPEG/PNG/WebP, 400 for invalid."
Agent: *implements task 1 in fresh context*
noskills: "Tests pass. Status report: what's done?"
Agent: "Endpoint works. Error handling done. Docs not yet."
noskills: "Docs carried as debt. Task 2: Add validation..."
*Each task: fresh context, clear scope, verified before advancing*
```

## What You Get

**Discovery that actually discovers.** Not "Got it, I'll start coding." noskills
asks 6 questions that probe product, engineering, and QA simultaneously — with
sub-questions injected by your active concerns. The agent scans your codebase
first, challenges your assumptions, then asks. You get a spec that reflects what
you actually need, not what the agent guessed.

**Specs that track themselves.** Every spec has a status (draft -> approved ->
executing -> done), tasks with checkboxes, and acceptance criteria from both the
spec AND your active concerns. You don't track progress — noskills tracks it.
The agent reports against specific criteria, not vibes.

**Agents that can't lie about being done.** When the agent says "task done,"
noskills runs your test suite first. If tests fail, the task stays incomplete —
no exceptions. Then it asks for a status report against each acceptance
criterion. Items the agent didn't finish carry forward as debt with increasing
urgency. The agent can't declare victory and move on.

**Context that never rots.** Each task runs in a sub-agent with fresh context.
The main agent orchestrates, sub-agents execute. No `/clear` gymnastics, no "the
agent forgot my requirements." State lives in files, not in the agent's memory.

**Concerns that shape everything.** "We're open-source" isn't a wish — it's a
lens that injects documentation requirements into every spec,
contributor-friendliness checks into every review, and permissive-default
reminders into every task. Stack concerns to define your project's character.

**One source of truth for every tool.** Write rules once in `.eser/rules/`.
noskills generates AGENTS.md CLAUDE.md, .cursorrules, Kiro steering files,
Copilot instructions, Windsurf rules, OpenCode AGENTS.md + plugins, Codex CLI
hooks + TOML agents, and Copilot CLI hooks + MCP config. Your teammate on Cursor
and your teammate on Claude Code both get the same conventions, automatically.

**A human who's always in charge.** noskills never makes decisions silently.
Discovery questions -> you answer. Spec approval -> you decide. Architectural
choices -> you pick. Concern tensions -> you resolve. The agent executes, you
decide. Explicit > Clever.

## Who Is This For

noskills is for builders who use AI coding agents daily and are tired of
babysitting them — repeating the same corrections, watching the agent forget
requirements mid-session, and manually tracking what's done and what isn't. Solo
builders get a structured workflow that keeps the agent focused. Teams get a
shared source of truth that every tool and every teammate inherits
automatically.

## How noskills differs

|                           | Sequential Thinking                       | gstack                                           | Skills / Rules                    | Ralph Loops                              | noskills                                   |
| ------------------------- | ----------------------------------------- | ------------------------------------------------ | --------------------------------- | ---------------------------------------- | ------------------------------------------ |
| What it does              | Structures agent's internal thinking      | Role-based slash commands (CEO, Eng, QA)         | Loads rules into context          | Resets session, keeps state in files     | Manages workflow via state machine         |
| Metaphor                  | "Think out loud"                          | "Virtual team"                                   | "Law book"                        | "Clean desk every turn"                  | "Scrum Master"                             |
| User role                 | None — agent self-talks                   | Chooses which role to invoke                     | Writes rules, hopes agent follows | Manages context manually                 | Active decision-maker at every gate        |
| Enforcement               | None                                      | None — behavioral                                | None — behavioral                 | Context reset only                       | Mechanical (hooks block actions)           |
| State tracking            | Thought history (in-memory)               | Learnings (cross-session)                        | None                              | File-based (manual)                      | Full state machine, per-spec               |
| File control              | None                                      | None                                             | None                              | None                                     | Phase-based edit control                   |
| Sub-agents                | None                                      | None (single agent, multiple roles)              | None                              | None                                     | Executor / verifier / test-writer pipeline |
| Discovery                 | None                                      | /office-hours (similar concept)                  | None                              | None                                     | 6 structured questions + concerns          |
| Works alongside noskills? | Yes — ST for thinking, noskills for doing | Yes — gstack for roles, noskills for enforcement | Replaced by noskills              | Automated by noskills sub-agent pipeline | —                                          |

**The core difference:** other tools tell the agent what to do and hope it
listens. noskills mechanically restricts what the agent _can_ do. When the agent
is in DISCOVERY, it literally cannot edit files — not because a rule says
"don't" but because a hook blocks the operation. That is the difference between
behavioral guidance and mechanical enforcement.

noskills is not a replacement for any of these tools. Sequential Thinking helps
agents reason better. gstack assigns useful roles. Both can run alongside
noskills. The distinction is that noskills owns the workflow — who does what,
when, and whether the result was verified — while the others own the thinking or
the persona.

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

### The Scrum analogy

If you know Agile, you already know noskills:

| Agile / Scrum      | noskills                                      |
| ------------------ | --------------------------------------------- |
| User Story         | Spec                                          |
| Increment          | Spec's deliverable                            |
| Refinement meeting | Discovery (6 questions + concerns)            |
| Sprint Planning    | Spec draft → approval (tasks defined)         |
| Sprint             | Execution (runs until spec is done)           |
| Dev team           | Sub-agents (executor, verifier, test-writer)  |
| Scrum Master       | noskills (state machine, hooks, backpressure) |
| Definition of Done | Acceptance criteria                           |
| Sprint Review      | AC status report + verifier validation        |
| Retrospective      | Debt tracking + concern reminders             |
| Product Owner      | You (every decision is yours)                 |

One key difference: in Scrum, a sprint is time-boxed. In noskills, execution
runs until the spec is complete — it is a single-story sprint. This is why
mid-execution checkpoints make no sense: a Scrum Master does not stop a sprint
halfway through the only story. If the story is too big, you split it _before_
the sprint starts — not during. That is exactly what noskills does at
DISCOVERY_REVIEW with the split proposal.

## Philosophy — A Scrum Master for Agents

I used to teach Agile. In those trainings, I'd go all the way back to the Toyota
Production System to explain why we do what we do.

I'd talk about WIP limits — not as a process rule, but as acknowledgment that
human attention is finite. I'd explain how story points emerged from the need to
break work into pieces small enough for a single person's working memory. I'd
walk through why we have daily standups (people lose track), why we have
Definition of Done (everyone's "done" is different), why we have acceptance
criteria (without them, work drifts from intent). I'd talk about cognitive load
— how the brain starts dropping things when you pile on too much context.

When I first encountered context rot in AI agents, it felt familiar. The agent
starts strong, makes a great plan, then gradually loses the plot — forgets
instructions, gets sloppy, declares things "done" that aren't. I'd seen this in
humans. The practices we built around human limitations applied directly.

When I saw Ralph loops, I got excited — they felt like sprints. Each iteration
starts clean: fresh context, clear goal, defined scope. Just like a sprint
protects the team from mid-sprint chaos, a Ralph loop protects the agent from
context accumulation. But just as sprint quality depends on what goes INTO the
sprint, loop quality depends on what context the agent receives.

I'd also teach Jidoka — one of the pillars of the Toyota Production System.
Jidoka means "automation with a human touch." The machine runs autonomously, but
when it detects an anomaly, it stops and calls a human. The human doesn't watch
every step — they intervene at the right moments. Production quality comes from
human and machine working together, each doing what they're best at.

noskills is Jidoka for AI coding. The agent runs autonomously through tasks, but
at every phase transition — discovery, spec approval, blocked decisions — it
stops and the human decides. The human doesn't watch every line of code. They
intervene at the moments that matter: what to build, whether the plan is right,
which tradeoffs to accept. The agent handles execution; the human handles
judgment.

That's why I stopped using skills and built a scrum master instead:

- **Ralph loops are sprints** — fresh context, clear scope, no carryover rot.
- **Discovery is sprint planning** — the same questions a good PM asks before
  work starts.
- **Backpressure is Definition of Done** — "done" requires evidence, not
  declaration.
- **Debt tracking is the sprint board** — unfinished items don't vanish, they
  carry forward with increasing urgency.
- **Concerns are team values** — "we care about open source" shapes every
  decision, just like team values shape how a team works.
- **Phase transitions are Jidoka stops** — the machine pauses, the human
  decides, then the machine continues.
- **Explicit over clever** — noskills never makes decisions silently. It always
  asks.

The insight isn't technical. It's that the practices we spent decades developing
for human teams apply directly to AI agents — because the underlying problem is
the same: finite attention, drifting focus, and the need for structure to keep
work on track.

## Getting Started

noskills supports multiple AI coding platforms. Pick yours:

### Claude Code

Open Claude Code and paste:

    Run `npx eser@latest noskills init` — it will scaffold your project and guide you through setup.

That's it. The init command detects Claude Code, sets up hooks, generates
`CLAUDE.md`, and presents your next options automatically.

### OpenCode / OpenAI Codex CLI / GitHub Copilot CLI / Kiro

Open your agent in your project and run in the terminal:

    Run `npx eser@latest noskills init` — it will scaffold your project and guide you through setup.

noskills detects your agent, generates multi-file steering files (with `always`,
`auto`, and `fileMatch` inclusion modes), installs hook configs, and creates
executor/verifier agents.

### Other agents

noskills generates a generic `AGENTS.md` at the project root. Any agent that
reads instruction files can use it. Run `noskills sync` after adding rules to
regenerate all tool files.

### Adding to an existing team project

If teammates already use noskills, the `.eser/` directory should be committed to
your repo. Run `noskills init` to detect your tool and generate tool-specific
files. The init command won't overwrite existing `.eser/` config — it only
generates the sync output for your tool.

## Quick Start

noskills works with any AI coding agent. Here's how to get started in a few
minutes.

### With an agent (Claude Code, Cursor, etc.)

```bash
eser noskills init                          # Scaffold .eser/, detect tools
eser noskills concern add open-source       # Activate concerns
eser noskills spec new "photo upload"       # Start spec -> DISCOVERY
# Agent takes over: calls noskills next, answers questions,
# builds to spec, reports progress. You approve transitions.

# Or skip structure entirely:
eser noskills free                          # FREE mode — no enforcement
# Work freely, then exit when you want structure back:
eser noskills free --exit                   # Back to IDLE
```

After `init`, your AGENTS.md (or CLAUDE.md, .cursorrules, etc.) tells the agent
to call `noskills next` at every step. The agent follows the JSON output. You
never need to prompt-engineer the agent's behavior — noskills handles that.

### Without an agent (agentless CLI mode)

```bash
eser noskills init
eser noskills concern add beautiful-product
eser noskills spec new "photo upload"
eser noskills next -o text                  # Shows all 6 questions at once
eser noskills next --answer='{"status_quo":"...","ambition":"...","reversibility":"...","user_impact":"...","verification":"...","scope_boundary":"..."}' -o text
# Classification: what does this spec involve?
eser noskills next --answer='{"involvesWebUI":true,"involvesCLI":false,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}' -o text
eser noskills approve
eser noskills next --answer="start" -o text # Begin execution
eser noskills next --answer="task-1 done" -o text
# noskills asks for status report against acceptance criteria
eser noskills next --answer='{"completed":["endpoint works"],"remaining":["error UI"]}' -o text
# debt carries forward to next iteration
eser noskills status -o markdown
```

After discovery, noskills asks you to classify the spec (UI, API, migration,
data handling). If you skip this by running `approve` directly, all concern
sections default to N/A — the spec stays clean.

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

Each iteration is a fresh `claude -p` process with zero context accumulation —
this is the Ralph loop pattern (originated by Geoff Huntley). AI agents suffer
from context rot: the longer they work, the more stale instructions accumulate
and performance degrades. The Ralph loop solves this by restarting the agent
every iteration with fresh context while persisting state in files. noskills IS
the Ralph loop — no separate bash script needed.

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

noskills is a state machine. Your spec moves through phases — each phase has
different rules, different questions, and different behavioral constraints for
the agent. You don't need to understand the internals to use noskills, but
here's how it works under the hood.

### The State Machine

Every spec follows a deterministic phase flow:

```
IDLE -> DISCOVERY -> DISCOVERY_REVIEW -> SPEC_DRAFT -> SPEC_APPROVED -> EXECUTING <-> BLOCKED
 ^  \                                                                       |
 |   <-> FREE                                                               |
 +--------------------------------- DONE <---------------------------------+
```

| Phase                | What happens                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| **IDLE**             | No active spec. Start one with `noskills spec new "..."`               |
| **FREE**             | No enforcement. Work freely. Agent has no restrictions from noskills   |
| **DISCOVERY**        | 6 blended questions probe product, engineering, and QA simultaneously  |
| **DISCOVERY_REVIEW** | User reviews and confirms all discovery answers before spec generation |
| **SPEC_DRAFT**       | Spec generated from discovery answers. Human reviews                   |
| **SPEC_APPROVED**    | Spec approved, waiting to start. A deliberate "ready but not yet" gate |
| **EXECUTING**        | Agent works through the spec. Reports progress each iteration          |
| **BLOCKED**          | Agent hit a decision it can't make alone. Human resolves               |
| **DONE**             | Spec complete. Summary with iteration count and decisions              |

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
    "tone": "Direct. Orchestrate immediately — spawn sub-agents."
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

| Phase      | Behavioral tone                  | Key rules                                                     |
| ---------- | -------------------------------- | ------------------------------------------------------------- |
| IDLE       | "Welcoming. Present choices"     | No file edits until free mode or spec approved                |
| FREE       | "Quiet. No enforcement."         | No restrictions — work freely                                 |
| DISCOVERY  | "Curious, has a stake"           | Push back on shallow answers, probe for specifics, don't code |
| SPEC_DRAFT | "The user is reviewing"          | Don't modify the spec, don't start coding                     |
| EXECUTING  | "Orchestrate — spawn sub-agents" | Delegate to sub-agents, don't edit files directly             |
| BLOCKED    | "Brief. Decision time."          | Present decision as-is, don't suggest preferences             |
| DONE       | "Celebrate briefly, then stop"   | Don't start new work                                          |

**Git is read-only** for agents (configurable via `allowGit: true` in manifest).
Agents may read (`git log`, `git diff`, `git status`) but never write
(`git commit`, `git push`, `git checkout`). This is enforced at three levels:
behavioral rules, AGENTS.md instruction, and PreToolUse hook.

When the agent's iteration count exceeds `maxIterationsBeforeRestart` (default
15), an `urgency` message warns that context is degrading and recommends a fresh
session.

### Platform Support

| Platform    | Rules          | Hooks       | Agents      | MCP | Enforcement     |
| ----------- | -------------- | ----------- | ----------- | --- | --------------- |
| Claude Code | CLAUDE.md      | full        | Task tool   | yes | Mechanical      |
| Kiro        | steering/      | Run Command | delegation  | yes | Mechanical      |
| Codex CLI   | AGENTS.md      | full        | spawn_agent | yes | Mechanical      |
| Copilot CLI | AGENTS.md      | full        | /fleet      | yes | Mechanical      |
| OpenCode    | AGENTS.md      | plugins     | delegation  | yes | Mechanical      |
| Cursor      | .cursorrules   | none        | none        | yes | Behavioral only |
| Windsurf    | .windsurfrules | none        | none        | yes | Behavioral only |

Platforms with **mechanical enforcement** use hooks to prevent unauthorized file
edits, block git write commands, and enforce phase transitions. Platforms with
**behavioral-only enforcement** rely on rules and instructions — the agent is
asked to follow the protocol but cannot be mechanically prevented from breaking
it.

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
   recommends a `/clear` for fresh context on the next task. The sub-agent
   pattern handles context isolation naturally, so this is advisory only.

### Scoped Folder Rules

In monorepos, different packages have different constraints. Drop a
`.folder-rules.md` in any directory with markdown bullet rules:

```markdown
- Generated AGENTS.md must preserve existing content outside noskills:start/end
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

For larger specs, noskills may propose splitting the work into separate specs at
the end of discovery — for example, separating a bug fix from a feature
addition. You always decide: keep as one spec or split. noskills never splits on
its own.

### Spec Classification

After discovery answers are submitted, noskills asks the user to classify the
spec along five boolean axes:

| Flag                   | What it controls                                        |
| ---------------------- | ------------------------------------------------------- |
| `involvesWebUI`        | Web/Mobile UI sections from beautiful-product concern   |
| `involvesCLI`          | CLI/Terminal UI loading states                          |
| `involvesPublicAPI`    | API documentation sections from open-source concern     |
| `involvesMigration`    | Migration checklist sections from compliance/long-lived |
| `involvesDataHandling` | Data safety sections from compliance concern            |

Classification determines which concern sections appear in the generated spec.
Irrelevant sections are skipped entirely — a backend API change won't get UI
state checklists, and a CSS tweak won't get migration warnings. This replaces
keyword-based guessing with explicit user input.

The classification is submitted as JSON via `noskills next`:

```bash
noskills next --answer='{"involvesWebUI":true,"involvesCLI":false,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}'
```

### Hooks — Zero-Token Bookkeeping

noskills installs hooks for Claude Code (`.claude/settings.json`), Kiro
(`.kiro/settings/hooks.json`), OpenCode (`.opencode/plugins/noskills.ts`), Codex
CLI (`.codex/hooks.json`), and Copilot CLI (`.github/hooks/noskills.json`) that
handle state bookkeeping without spending LLM tokens. Claude Code hooks:

| Hook                | Event        | What it does                                                                                                                                         |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pre-tool-use**    | PreToolUse   | Blocks file edits outside EXECUTING phase. Blocks git write commands.                                                                                |
| **stop**            | Stop         | Increments iteration counter, snapshots `git diff` into state, checks restart threshold. The Ralph loop's heartbeat.                                 |
| **post-file-write** | PostToolUse  | Logs modified file paths to `.eser/.state/files-changed.jsonl`                                                                                       |
| **post-bash**       | PostToolUse  | Logs noskills CLI invocations for observability                                                                                                      |
| **session-start**   | SessionStart | Runs `noskills next` at session start so the agent is immediately oriented. No CLAUDE.md reading needed — the hook delivers the current instruction. |

Kiro hooks map the same behavioral guarantees to Kiro-native triggers (Pre Tool
Use, Post Tool Use, Agent Stop, Prompt Submit) using Run Command actions.
OpenCode hooks use the plugin system (`.opencode/plugins/`) with event handlers
for session.created, tool.execute.before/after, and session.deleted. Codex CLI
hooks use `.codex/hooks.json` with PascalCase events (SessionStart, PreToolUse,
PostToolUse, Stop). Copilot CLI hooks use `.github/hooks/noskills.json` with a
versioned schema (`{"version": 1, "hooks": {...}}`) and array-format commands.

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
    |                                        Claude Code
    |-- -> CLAUDE.md                         (instructions)
    |-- -> AGENTS.md                         (shared: Codex / Copilot / OpenCode)
    |-- -> .claude/settings.json             (hooks)
    |-- -> .claude/agents/                   (agents)
    |                                        Kiro
    |-- -> .kiro/steering/*.md               (steering files)
    |-- -> .kiro/settings/hooks.json         (hooks)
    |-- -> .kiro/settings/mcp.json           (MCP)
    |-- -> .kiro/agents/*.json               (agents)
    |-- -> .kiro/specs/                      (spec projection)
    |                                        Codex CLI
    |-- -> .codex/hooks.json                 (hooks)
    |-- -> .codex/agents/*.toml              (agents)
    |-- -> .codex/config.toml                (MCP)
    |                                        Copilot CLI
    |-- -> .github/hooks/noskills.json       (hooks)
    |-- -> .github/agents/*.agent.md         (agents)
    |-- -> .github/copilot-instructions.md   (IDE instructions)
    |-- -> .copilot/mcp.json                 (MCP)
    |                                        OpenCode
    |-- -> .opencode/plugins/noskills.ts     (hooks)
    |-- -> .opencode/agents/*.md             (agents)
    |-- -> .opencode/skills/*.md             (spec projection)
    |-- -> opencode.json                     (MCP)
    |                                        Cursor / Windsurf / Copilot IDE
    |-- -> .cursorrules                      (Cursor)
    +-- -> .windsurfrules                    (Windsurf)
```

Write your rules once in `.eser/rules/`, run `noskills sync`, and every tool
gets the same instructions in its native format.

Generated AGENTS.md includes:

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

> **Future:** `spec new --from-plan <file>` — import an existing plan document
> (e.g., from Claude Code's plan mode) as the basis for discovery, pre-filling
> some answers. Not yet implemented.

## Common Workflows

**"I have a bug report from a customer"**

```bash
eser noskills spec new "Fix: users can't upload files over 10MB"
# Discovery mode: Ship fast (skip expansions, minimal questions)
# 3 tasks generated: reproduce, fix, test
# Agent implements in ~8 minutes with verification
```

**"I need to add a major feature"**

```bash
eser noskills spec new "Add real-time collaboration to the editor"
# Discovery mode: Explore scope (expansion proposals, dream state table)
# 12 tasks generated with architectural decisions
# Agent works through tasks over multiple sessions
# Debt tracking ensures nothing is forgotten between sessions
```

**"I have meeting notes and need to turn them into work"**

```bash
eser noskills spec new "From product meeting: need analytics dashboard,
  CEO wants daily active users, retention curves, revenue per cohort.
  Mobile must work. Launch by end of Q2."
# noskills accepts any input format — meeting notes, kanban cards, emails
# Discovery challenges assumptions: "Is mobile-first or desktop-first?"
# Spec generated with proper tasks, not meeting note fragments
```

**"I want the agent to work autonomously while I sleep"**

```bash
eser noskills run --unattended --max-iterations=50
# Fresh agent per iteration, zero context rot
# Blocks logged to file — resolve in the morning
# Git commits handled by CLI, not the agent
```

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

| Command                               | Description                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `init`                                | Scaffold `.eser/`, detect project traits, install hooks            |
| `status [-o format]`                  | Show current phase, spec name, progress, debt                      |
| `spec new <name> "description"`       | Start a new spec, enter DISCOVERY                                  |
| `spec list [-o format]`               | List all specs with phase info                                     |
| `spec <name> next [-o format]`        | Get instruction for current phase                                  |
| `spec <name> next --answer="..."`     | Submit answer and advance state                                    |
| `spec <name> approve`                 | Approve spec draft -> SPEC_APPROVED                                |
| `spec <name> done`                    | Complete execution -> DONE                                         |
| `spec <name> block "reason"`          | Mark execution as blocked                                          |
| `spec <name> reset`                   | Reset current spec to IDLE                                         |
| `spec <name> revisit "reason"`        | Return to DISCOVERY from EXECUTING                                 |
| `spec <name> split --into x --into y` | Split spec into sub-specs                                          |
| `run [--spec=name] [--unattended]`    | Autonomous execution loop (Ralph loop)                             |
| `watch [-o format]`                   | Live dashboard monitoring agent progress                           |
| `concern add/remove/list`             | Manage active concerns                                             |
| `rule add/list/promote`               | Manage permanent rules                                             |
| `sync`                                | Regenerate tool-specific instruction files + hooks                 |
| `purge [--force]`                     | Remove all noskills content (specs, rules, concerns, hooks, state) |

All spec commands use the `spec <name> <command>` positional format. The spec
name always comes before the subcommand. Use `spec list` to see available specs.

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
runtime) and stores it as `command`. All generated output — `AGENTS.md`
instructions, hook remediation messages, behavioral rules, transition hints —
uses this prefix. Users who invoke via `deno run`, `npx`, homebrew, or global
install all get correct command references.

**Tools vs Providers:**

- **Tools** = the IDE or agent environment (`claude-code`, `cursor`, `kiro`,
  `copilot`, `windsurf`, `opencode`, `codex`, `copilot-cli`). Affects which sync
  output files are generated.
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
- **Coding tools:**
  - **Claude Code** — `CLAUDE.md`, `.claude/` directory
  - **Kiro** — `.kiro/` directory
  - **Codex CLI** — `.codex/` directory, `.codex/config.toml`
  - **Copilot CLI** — `.copilot/` directory, `.github/hooks/`
  - **Copilot IDE** — `.github/copilot-instructions.md`
  - **OpenCode** — `.opencode/` directory, `opencode.json`
  - **Cursor** — `.cursorrules`, `.cursor/` directory
  - **Windsurf** — `.windsurfrules`
  - **Kilo Code** — `.kilo/` directory _(detection only — full adapter planned)_
  - **Cline** — `.clinerules` file _(detection only — full adapter planned)_
  - **Roo Code** — `.roo/` directory, `.roomodes` file _(detection only — full
    adapter planned)_

Detected coding tools are auto-synced on init, including hook installation for
tools that support it. Invocation method is auto-detected and stored in
`manifest.yml` as `noskills.command` — all output references use this prefix.

## License

Apache-2.0
