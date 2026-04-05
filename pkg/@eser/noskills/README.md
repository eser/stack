# [@eser/noskills](./)

AI agents are powerful. But left alone, they take shortcuts — they skip
requirements, rush past edge cases, declare "done" when it isn't, and forget
your spec/PRD details halfway through. You end up babysitting the thing that was
supposed to save you time.

Noskills is here to fix this. It's designed as a state-machine orchestrator for
AI coding agents. An agent can't skip discovery, can't ignore tests, can't
declare victory without proof. Not because a prompt says "please don't" —
because the system mechanically blocks it.

Think of it as a Scrum Master for your agents.

Noskills provides you to a better workflow and context health with replacing
skill-packs. Loading skills into context and hoping agents pick the right one is
a pull model — and it doesn't work. noskills is a push model: it delivers
exactly the right instruction at the right time. The agent never decides what to
do next. The state machine does.

Not every task needs a full discovery cycle. Bug fix? ship-fast mode — 2
questions, spec in 2 minutes. Major feature? full mode with adaptive follow-ups.
You pick the depth. See [Discovery Modes](#discovery-modes) below.

If you want to test noskills with a platform other than Claude Code, reach out —
we'd love early feedback. Find me at [github.com/eser](https://github.com/eser)
or [@eserozvataf](https://x.com/eserozvataf).

## The Problem

Agents have a context rot problem. The more skills, rules, and conventions you
load upfront, the worse the agent performs — its context window fills with
instructions it doesn't need yet, and it forgets the ones it does.

You say "add photo upload with validation." The agent says "on it!" and starts
coding immediately. Twenty minutes later you discover it skipped validation,
forgot error handling, deleted your existing code, and declared the task
complete. You correct it. It fixes one thing, breaks another. Context fills up.
The agent forgets or gets distracted even you told it ten minutes ago. You start
over.

### Why skills don't work

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

## Noskills Solution

**Before you code, it makes you think.** noskills asks 6 discovery questions
that probe product, engineering, and QA at the same time. Not a checklist — the
questions adapt to your answers. If you say "WebSocket," it asks about
reconnection. If you're vague, it pushes back. You end up with a spec that
reflects what you actually need, not what the agent guessed.

**It generates a real spec with real tasks.** Discovery answers become a spec
with concrete tasks and acceptance criteria. You review it, adjust it, approve
it. The agent doesn't touch code until you say go.

**Each task runs in isolation.** The main agent orchestrates, sub-agents
execute. Fresh context per task. No context rot, no forgotten requirements, no
"the agent got confused after 30 minutes."

**The agent can't lie about being done.** Tests run before a task is accepted.
The agent reports against specific acceptance criteria, not vibes. Unfinished
items carry forward as debt — they don't disappear.

**Your concerns shape everything — without bloating context.** "We're
open-source" isn't a label — it's a lens. It adds a documentation check to the
current spec, a contributor question to the current discovery, a license
reminder to the current task. Only what's relevant to the current phase is
delivered. Stack multiple concerns to define your project's character.

**One source of truth for all tools.** Write rules once. noskills generates
CLAUDE.md, AGENTS.md, .cursorrules, Kiro steering files, and more. Your teammate
on Cursor and your teammate on Claude Code get the same conventions,
automatically.

**A human who's always in charge.** noskills never makes decisions silently.
Discovery questions -> you answer. Spec approval -> you decide. Architectural
choices -> you pick. Concern tensions -> you resolve. The agent executes, you
decide. Explicit > Clever.

### Before & After

**Without noskills:**

```
You: "Add photo upload with validation"
Agent: *starts coding immediately*
Agent: "Done! Photo upload is working."
You: "There's no validation. And you deleted my error handler."
Agent: "I apologize, let me fix that..."
*context fills up, agent forgets everything, starts from scratch*
```

**With noskills:**

```
You: "Add photo upload with validation"
noskills: "What do users do today without this?"
You: "They fill forms manually"
noskills: "1-star and 10-star versions?"
You: "1-star: basic upload. 10-star: auto-detect from photo"
... 4 more questions, each adapting to your answers ...
noskills: "Here's your spec. 5 tasks. Approve?"
You: "Approved"
Agent: *implements task 1 in fresh context, tests pass, reports progress*
Agent: *implements task 2 in fresh context, tests pass, reports progress*
*Each task: clear scope, verified, nothing forgotten*
```

### How it works (briefly)

Every spec moves through phases:

```
IDLE → DISCOVERY → REVIEW → DRAFT → APPROVED → EXECUTING ↔ BLOCKED
 ^        ^                                        |
 |        +-------------- revisit -----------------+
 |                                                 |
 +------------------ COMPLETED ←------------------+
                    (done | cancelled | wontfix)
```

Any phase can exit via `cancel` or `wontfix`. Mid-execution, `revisit` returns
to DISCOVERY with progress preserved. At each phase, the agent gets exactly the
instructions it needs — nothing more. In DISCOVERY, it can't edit files
(mechanically blocked, not just asked nicely). In EXECUTING, it delegates to
sub-agents with fresh context per task. At every gate, you decide.

The agent calls `noskills next`, gets a JSON payload with its current task,
behavioral rules, and concern reminders. It does the work, calls `noskills next`
again.

**Hooks enforce the rules at the system level.** The agent doesn't know hooks
exist. It just can't do things it shouldn't — like editing files during
discovery or running git commands. This is the difference between "please don't"
and "you can't."

### Key concepts

**Discovery** — Adaptive questions that challenge your assumptions, surface edge
cases, and catch things you'd miss. Discovery modes shape the depth.

**Concerns** — your project's DNA. "open-source" adds a documentation check.
"beautiful-product" demands every UI state is designed. "move-fast" accepts
good-enough. Concerns stack, but only the current phase's slice is delivered —
no upfront context dump.

**Specs** — living documents with tasks, acceptance criteria, and status
tracking. Not a plan the agent ignores — a contract it's held to.

**Sub-agent pipeline** — main agent orchestrates, sub-agents execute individual
tasks in fresh context. Verifier checks the work. Test-writer ensures coverage.
No context rot.

**Verification backpressure** — tests must pass before a task is accepted.
Unfinished items become debt that follows the agent around with increasing
urgency.

**Packs** — installable bundles of rules and concerns.
`noskills pack install typescript` gives you 3 rules and a concern. Share packs
across projects or teams.

**Learnings** — mistakes from past specs are remembered and surfaced in future
discovery. "Last time you assumed SDK v2 and it was v3" appears before you make
the same mistake.

### Discovery Modes

Before the six questions, noskills asks which discovery mode to use:

| Mode            | Focus                            | Best for                          |
| --------------- | -------------------------------- | --------------------------------- |
| full            | Standard 6 questions             | New features (default)            |
| validate        | Challenge assumptions            | Detailed plans, long descriptions |
| technical-depth | Architecture, data flow          | Infrastructure, integration       |
| ship-fast       | Minimum viable scope             | Bug fixes, quick iterations       |
| explore         | Think bigger, find opportunities | Brainstorming, scope expansion    |

The mode shapes how questions are asked and which concern extras appear.

## Who is this for

**Vibe coders** who are tired of babysitting agents — you want to describe what
you need and get it built correctly. ship-fast mode: 2 questions, 2 minutes,
spec ready. Autonomous mode runs overnight.

**Solo builders** who use AI agents daily and want structure without overhead.
Discovery catches what you'd miss. Verification catches what the agent skips.

**Tech leads and engineering managers** who need their team's agents to follow
the same conventions, pass the same quality gates, and produce auditable specs —
across Cursor, Claude Code, Kiro, and every other tool.

**Product owners and PMs** who want to define specs, delegate questions to
engineers, and approve results — without touching a terminal. The web dashboard
and delegation system are built for you.

## Quick Start

Open your AI coding agent (Claude Code, Cursor, Kiro, Copilot, etc.) and tell
it:

```
Run `npx eser@latest noskills init` — it will scaffold your project and guide you through setup.
```

noskills detects your tools, sets up hooks, and generates instruction files.
Then:

```bash
noskills spec new "photo upload with validation"   # start discovery
# Answer 6 questions. Review spec. Approve.
# Agent executes tasks with verification.
# You approve the result.
```

That's it — from zero to executing spec in under 5 minutes. The discovery
questions take 2-5 minutes depending on mode. The agent handles the rest.

### Autonomous mode

```bash
noskills run --unattended --max-iterations=50
# Fresh agent per iteration, zero context rot
# Blocks logged to file — resolve in the morning
```

### Live monitoring

```bash
noskills watch   # real-time dashboard in your terminal
noskills web     # same dashboard in your browser
```

The web dashboard (`noskills web`) provides the same experience as the terminal
— spec reading with inline actions, Claude Code tabs, real-time updates. Product
owners and PMs can review specs, answer delegated questions, and approve from
their browser without ever opening a terminal.

## Platform Support

| Platform    | Enforcement                             |
| ----------- | --------------------------------------- |
| Claude Code | Full — hooks block unauthorized actions |
| Kiro        | Full — steering files + hooks           |
| Codex CLI   | Full — hooks + agents                   |
| Copilot CLI | Full — hooks + agents                   |
| OpenCode    | Full — plugins + agents                 |
| Cursor      | Behavioral — rules synced, no hooks     |
| Windsurf    | Behavioral — rules synced, no hooks     |

"Full" means the agent is mechanically prevented from breaking rules.
"Behavioral" means the agent is asked to follow rules — it usually does, but
can't be forced.

## Multi-user

Multiple people can work on the same spec. Discovery questions can be delegated
— "I can't answer this, ask Ahmet." Delegated items must be signed off before
the spec can be approved, like GitHub reviewers.

```bash
noskills config set-user --from-git    # set your identity
noskills spec upload review            # see what's delegated to you
```

Every action is attributed — who answered what, who approved, who added which
requirement.

### Getting your team on board

One person starts: `noskills init`, create a spec, ship it. The `.eser/`
directory commits to your repo. When a teammate opens the project, they run
`noskills init` — it detects their tool (Cursor, Claude Code, Kiro, whatever)
and generates the right instruction files. Same rules, same concerns, same
quality gates — automatically.

No migration. No team-wide rollout meeting. One person starts, others join when
they see the specs landing correctly.

## Usage Details

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

### Behavioral Guardrails

Every `noskills next` output includes a `behavioral` block with phase-specific
rules. These tell the agent HOW to behave, not just WHAT to do:

| Phase     | Behavioral tone                  | Key rules                                                     |
| --------- | -------------------------------- | ------------------------------------------------------------- |
| IDLE      | "Welcoming. Present choices"     | No file edits until spec approved                             |
| DISCOVERY | "Curious, has a stake"           | Push back on shallow answers, probe for specifics, don't code |
| REVIEW    | "Careful reviewer"               | Present answers, user must confirm each one                   |
| DRAFT     | "The user is reviewing"          | Don't modify the spec, don't start coding                     |
| APPROVED  | "Patient. Wait for go signal"    | Don't start coding until user triggers execution              |
| EXECUTING | "Orchestrate — spawn sub-agents" | Delegate to sub-agents, don't edit files directly             |
| BLOCKED   | "Brief. Decision time."          | Present decision as-is, don't suggest preferences             |
| COMPLETED | "Celebrate briefly, then stop"   | Don't start new work (done, cancelled, or wontfix)            |

**Git is read-only** for agents (configurable via `allowGit: true` in manifest).
Agents may read (`git log`, `git diff`, `git status`) but never write
(`git commit`, `git push`, `git checkout`). This is enforced at three levels:
behavioral rules, AGENTS.md instruction, and PreToolUse hook.

When the agent's iteration count exceeds `maxIterationsBeforeRestart` (default
15), an `urgency` message warns that context is degrading and recommends a fresh
session.

### Concerns — The Project's DNA

Concerns define what your project IS. They stack on top of each other and affect
discovery questions, spec sections, execution reminders, and acceptance
criteria:

| Concern               | Effect                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| **open-source**       | Prioritize contributor experience, default to permissive choices                     |
| **beautiful-product** | Every UI state specified — empty, loading, error, success. No AI slop                |
| **long-lived**        | Favor boring technology, every shortcut needs justification                          |
| **move-fast**         | Good enough is good enough, defer polish to v2                                       |
| **compliance**        | Every state change must be traceable, verification is mandatory                      |
| **learning-project**  | Experimentation encouraged, document learnings over polish                           |
| **well-engineered**   | Performance measured, tests strategic, errors helpful, security built-in, observable |

Concerns inject at every phase (DISCOVERY, REVIEW, EXECUTING, etc.) — but only
the slice relevant to the current phase. The agent never sees all concern data
at once:

- **DISCOVERY** — extra sub-questions, dream state prompts
- **REVIEW** — review dimension checklist (scope-filtered by classification — UI
  dimensions only appear for UI specs)
- **DRAFT** — spec sections, registry table skeletons
- **EXECUTING** — reminders (tier 1 at compile-time, tier 2 per-file via hooks),
  acceptance criteria, tension gates
- **COMPLETED** — learning prompts (done, cancelled, or wontfix)

When concerns conflict (e.g., move-fast + compliance), noskills surfaces the
tension to the human rather than resolving it silently.

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

## How noskills differs

|                             | Sequential Thinking                  | gstack                                                               | Superpowers                                                     | agent-skills                                                     | Skills / Rules                    | Ralph Loops                              | noskills                                   |
| --------------------------- | ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- | ---------------------------------------- | ------------------------------------------ |
| What it does                | Structures agent's internal thinking | Role-based slash commands (CEO, Eng, QA)                             | Step-by-step execution playbooks                                | Static workflow patterns for agents                              | Loads rules into context          | Resets session, keeps state in files     | Manages workflow via state machine         |
| Metaphor                    | "Think out loud"                     | "Virtual team"                                                       | "Instruction manual"                                            | "Reference book"                                                 | "Law book"                        | "Clean desk every turn"                  | "Scrum Master"                             |
| User role                   | None — agent self-talks              | Chooses which role to invoke                                         | Configures playbooks                                            | Loads patterns into context                                      | Writes rules, hopes agent follows | Manages context manually                 | Active decision-maker at every gate        |
| Enforcement                 | None                                 | None — behavioral                                                    | None — behavioral                                               | None — behavioral                                                | None — behavioral                 | Context reset only                       | Mechanical (hooks block actions)           |
| State tracking              | Thought history (in-memory)          | Learnings (cross-session)                                            | None                                                            | None                                                             | None                              | File-based (manual)                      | Full state machine, per-spec               |
| File control                | None                                 | None                                                                 | None                                                            | None                                                             | None                              | None                                     | Phase-based edit control                   |
| Sub-agents                  | None                                 | None (single agent, multiple roles)                                  | None                                                            | None                                                             | None                              | None                                     | Executor / verifier / test-writer pipeline |
| Discovery                   | None                                 | /office-hours (similar concept)                                      | Brainstorming skill (similar)                                   | None                                                             | None                              | None                                     | 6 structured questions + concerns          |
| Still needed with noskills? | Different layer — helps agents think | Unnecessary — noskills pushes role-specific rules at the right phase | Unnecessary — noskills delivers the right playbook mechanically | Unnecessary — noskills injects patterns as phase-aware reminders | Replaced by noskills              | Automated by noskills sub-agent pipeline | —                                          |

The pull model asks agents to pick the right skill at the right time. The push
model delivers exactly what's needed — no picking, no missing, no waste.

Every tool above solves a real problem. But they all share the same limitation:
they load instructions and hope the agent follows them. noskills doesn't hope —
it enforces. Hooks block the operation, not rules. The agent can't skip
discovery, can't bypass verification, can't declare done without evidence.

You don't need skill packs. You need a state machine.

Another distinction is that noskills owns the workflow — who does what, when,
and whether the result was verified — while the others own the thinking or the
persona.

**noskills vs gstack:** gstack achieves planning depth through persona
multiplication — 4 independent reviewers (CEO, Engineer, Designer, DX advocate)
each with a 2000+ line prompt. noskills achieves the same depth through concern
composition — each concern carries review dimensions (one-sentence prompts) that
push the agent to evaluate specific quality aspects at the right phase.
`well-engineered` pushes test strategy, performance, observability, threat
modeling, and error quality. `beautiful-product` pushes information hierarchy,
interaction states, accessibility, and design system alignment. `long-lived`
pushes architecture analysis, failure modes, and deployment safety. Same
planning power, fraction of the tokens: concerns are phase-scoped JSON, not
monolithic prompts. Enforced by hooks, not hoped for by the agent.

**noskills vs Superpowers:** Superpowers provides detailed execution playbooks —
step-by-step instructions for brainstorming, dispatching, executing, and
verifying. Each skill tells the agent exactly how to do the work, down to
specific checklists and verification tables. The key difference: Superpowers
defines the "how" exhaustively and hopes the agent follows all of it. noskills
defines the "what" and "when" minimally — the agent gets only the current
phase's constraints, and hooks enforce compliance. Superpowers is a detailed
instruction manual. noskills is a state machine that won't let you skip
chapters. You don't need the manual when the machine enforces the process.

**noskills vs agent-skills:** agent-skills is a collection of 20 workflow
patterns — anti-rationalization prompts, verification checklists, red flag
detectors — designed to be loaded into agent context at the start of a session.
The key difference: agent-skills loads everything upfront and trusts the agent
to apply the right pattern at the right time. noskills delivers specific
reminders at specific phases — you don't see the verification checklist during
discovery, and you don't see the brainstorming prompt during execution.
agent-skills is a reference book the agent carries everywhere. noskills is a
guide that shows you only the page you need right now — and won't let you turn
to the wrong one.

## The Mental Model

```
.cursorrules -> .cursor/rules/*.mdc -> eser/rules + skills -> noskills
  (1 file)      (modular, 1 tool)    (portable, curated)   (state-driven)
```

Each generation solved one bottleneck and discovered the next:

1. `**.cursorrules**` — single file, single tool. Couldn't split, couldn't
   scale, couldn't travel across tools.
2. `**.cursor/rules/*.mdc**` — modular, but still locked to Cursor.
3. `**eser/rules` + `eser-rules-manager**` — created as a portable,
   tool-agnostic instruction system. This **predated** Anthropic's Skills spec.
   When Skills arrived, eser/rules was adapted into skills format — validating
   the ecosystem was heading where eser/rules had already gone.
4. **noskills** — Skills hit a wall: context rot as they accumulated, agents
   picking wrong skills, manual sync across tools. The pull model failed.
   noskills drops skills entirely — state-driven push replaces context-heavy
   pull.

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
the sprint starts — not during. That is exactly what noskills does at REVIEW
with the split proposal.

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

## Technical Reference

State machine internals, JSON output format, hook implementation, CLI reference,
directory structure, configuration, and library API — see
**[README-HOW.md](./README-HOW.md)**.

## License

Apache-2.0
