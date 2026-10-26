# 🚦 [@eserstack/noskills](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/noskills` is
> published on npm under the same name, and the `noskills` command as the npm
> package `noskills` (`npm install -g noskills`); the JSR versions stay
> available but get no updates.

> **eserstack Product** — AI development orchestrator ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh -s noskills`

`noskills` is a command, so install it as a binary — the line above, or
`brew install eser/tap/noskills`,
`nix profile install github:eser/stack#noskills` or `npm i -g noskills`. On
Windows use `install.ps1 -Product noskills`. Every one of them installs the Go
build of the CLI ([cmd/noskills](../../../cmd/noskills)): the npm package is a
launcher that runs the binary of its `@eserstack/noskills-<platform>`
dependency, and carries this TypeScript CLI for the commands the binary hands
over to it.

Adding this package as a dependency (`pnpm add jsr:@eserstack/noskills`) gets
you the modules, not the command: the source package declares no `bin`, which is
generated at publish time by `scripts/npm-build.ts`. Depend on it when embedding
the orchestrator in your own program; install the binary when you want to run
it.

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
IDLE → DISCOVERY → REFINEMENT → PROPOSAL → APPROVED → EXECUTING ↔ BLOCKED
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

**Transition validation** (opt-in): at the end of discovery and at the spec
proposal, a second agent that sees only the spec, the answers and the transition
reports findings before you approve. The findings are advice and never block.
Turn it on with `next --validate` or a `validate` entry in the manifest; see
[The transition validator](./README-HOW.md#the-transition-validator).

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

The agent asks the six questions together and submits your answers in one call.
Follow-ups come after them, one at a time: when an answer is vague or risky, the
agent registers a follow-up, and `noskills next` hands each one out on its own
until you answer or skip it.

```bash
noskills spec upload followup reversibility "What's the rollback plan?"
noskills spec upload followup reversibilitya --answer="Feature flag, off by default"
```

### Listen-first merged entry

When you run `noskills spec <name> next` for the first time on a new spec,
noskills presents a single entry menu combining listen-first and mode selection:

- **(a)** Share context — write requirements, Linear tasks, meeting notes
  (recursive; you can keep adding)
- **(b)** Technical depth mode — architecture, data flow, integration focus
- **(c)** Move fast mode — minimum viable scope
- **(d)** Validate mode — challenge assumptions, find gaps

Option (a) appends to `discovery.userContext[]` without advancing. Picking b/c/d
sets `entryComplete: true` and starts discovery.

### Auto-classification

At DISCOVERY_REFINEMENT, noskills automatically classifies your spec across five
categories (Web UI, CLI, Public API, Migration, Data Handling) by regex-scanning
your spec description, userContext entries, and discovery answers. The
classification is shown with keyword evidence for you to confirm or adjust — no
separate classification prompt step required.

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
# Resolve the sections no discovery answer fills, or approve refuses
eser noskills spec photo-upload section list
eser noskills spec photo-upload section summary fill "Users upload photos from the app"
eser noskills spec photo-upload section premises na "The premises step already recorded them"
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

Nobody answers the agent during a run, so the loop compiles its prompt without
the rules that wait for you, such as AskUserQuestion prompts. When a decision
needs you, the agent runs `block` and the loop stops at BLOCKED. The loop always
runs Claude Code, so the prompt follows Claude Code's tool set whatever tools
`manifest.yml` lists first.

State persists in `.eser/.state/progresses/state.json` between iterations. The
Stop hook snapshots git state automatically. Verification backpressure prevents
advancing past broken tests. When `autoCommit: true` is set in `manifest.yml`,
the `noskills run` loop commits between iterations, whatever `allowGit` says:
`allowGit` governs the agent's git, and the loop runs its commits outside the
agent's git wrapper. Git writes are the CLI's responsibility, never the agent's.

### Behavioral Guardrails

Every `noskills next` output includes a `behavioral` block with phase-specific
rules. These tell the agent HOW to behave, not just WHAT to do:

| Phase      | Behavioral tone                  | Key rules                                                     |
| ---------- | -------------------------------- | ------------------------------------------------------------- |
| IDLE       | "Welcoming. Present choices"     | No file edits until spec approved                             |
| DISCOVERY  | "Curious, has a stake"           | Push back on shallow answers, probe for specifics, don't code |
| REFINEMENT | "Careful reviewer"               | Present answers, user must confirm each one                   |
| PROPOSAL   | "The user is reviewing"          | Don't modify the spec, don't start coding                     |
| APPROVED   | "Patient. Wait for go signal"    | Don't start coding until user triggers execution              |
| EXECUTING  | "Orchestrate — spawn sub-agents" | Delegate to sub-agents, don't edit files directly             |
| BLOCKED    | "Brief. Decision time."          | Present decision as-is, don't suggest preferences             |
| COMPLETED  | "Celebrate briefly, then stop"   | Don't start new work (done, cancelled, or wontfix)            |

The rules name only what the agent's tool has. Claude Code gets AskUserQuestion
and the plan-mode key (Shift+Tab); Cursor, Windsurf, Copilot, Kiro, Codex CLI
and OpenCode get numbered lists and plain questions instead. `noskills next`
takes these from the first tool in the manifest's `tools` list.

**Git is read-only** for agents (configurable via `allowGit: true` in manifest).
Agents may read (`git log`, `git diff`, `git status`) but never write
(`git commit`, `git push`, `git checkout`). Four layers apply this: behavioral
rules, the AGENTS.md instruction, the PreToolUse hook and a git wrapper.

The hook classifies the Bash command text. It catches git however it is quoted,
cased or prefixed (`"git"`, `g''it`, `GIT`, `env X=1 git`), inside `sh -c`,
`eval`, pipes and `$(…)`, in a script piped or heredoc-fed to a shell, and in a
script file it can read before the command runs (`bash run.sh`). A script the
same command writes and then runs is denied. What the hook cannot decide from
text is a program an interpreter assembles at run time, such as
`python -c "subprocess.run(['g'+'it','push'])"`.

The git wrapper covers that case. While `allowGit` is false, the SessionStart
hook writes a `git` script to `.eser/.state/bin/` and puts that directory first
on the PATH of the session's Bash commands through Claude Code's
`CLAUDE_ENV_FILE`, and `noskills run` puts it first on the PATH of the agent it
starts. Every git process the agent starts then runs through the script,
whatever built the command:

- Reads and clones run directly.
- A push is refused from any repository, since a clone anywhere can push to the
  project's remote.
- Any other write is refused when it acts on the project's repository, however
  the repository is named (`-C`, `--git-dir`, `GIT_DIR`). A command that starts
  with a git option the wrapper does not know is refused too, since that option
  may hide which repository it names.
- Writes to other repositories run, so tests that commit to temporary
  repositories still pass inside an agent session.

The wrapper asks `noskills invoke-hook git-exec` about each command it does not
run directly, and that check reads `allowGit` every time, so setting it to true
takes effect at once. Setting it to false takes effect in the next session. The
check has 30 seconds to answer. When it does not, the wrapper stops it and
refuses the command, so a slow registry cannot hang the agent's git call. The
default `command`, `npx eser@latest noskills`, can wait on the npm registry
before the check starts; set `command` to an installed noskills to keep the
check off the network. The Go binary is one: it answers the check in a few
milliseconds.

The PreToolUse hook also keeps the agent away from the settings these layers
read. In every phase and session mode, it refuses an edit or a Bash command that
would change the `noskills` section of `.eser/manifest.yml` (`allowGit`,
`command` and the other settings) or anything in `.eser/.state/bin/`, including
a command that moves or removes `.eser` or `.eser/.state` as a whole. Edits to
the manifest's other sections and to rules, concerns and specs under `.eser/` go
through, and so do noskills commands that update the manifest themselves
(`concern add`, `concern remove`). Change the `noskills` section yourself.

Which tools get the wrapper:

- Claude Code: the SessionStart hook writes it and puts it on PATH through
  `CLAUDE_ENV_FILE`. Claude Code does not always run that hook for a new
  conversation
  ([anthropics/claude-code#10373](https://github.com/anthropics/claude-code/issues/10373)).
  When `command -v git` in the session does not print the wrapper's path, run
  `/clear`, which runs the hook again, and check once more.
- `noskills run`: puts it on the PATH of the agent it starts.
- Codex, OpenCode, Copilot CLI and Kiro: their session-start hook writes the
  wrapper, but a hook in these tools cannot change the PATH of the commands that
  follow. Start the tool with the wrapper directory first on PATH, and check
  that `command -v git` inside the tool prints the wrapper's path:

  ```bash
  PATH="$PWD/.eser/.state/bin:$PATH" codex
  ```

- Cursor, Windsurf and GitHub Copilot in the editor run no noskills hooks, so
  neither the PreToolUse hook nor the wrapper applies. Only the generated rules
  ask the agent to leave git alone.

On Windows nothing is installed. The wrapper is a POSIX shell script, and a
`git.cmd` shim would not take its place: programs that start git without a
shell, such as Python's `subprocess` and Node's `child_process`, look up
`git.exe` and never run a `.cmd` file. The PreToolUse hook is then the
only noskills check on git.

These layers are guards against mistakes, not a sandbox. A program that starts
git by its absolute path, such as
`python -c "subprocess.run(['/usr/bin/g'+'it','push'])"`, or that sets its own
PATH, skips both the hook and the wrapper, and noskills cannot see it. Two
things stop it:

- Claude Code's sandbox, which the operating system enforces for every Bash
  command and the programs it starts. With `.git` in
  `sandbox.filesystem.denyWrite`, no sandboxed command can write the repository,
  whichever git binary it runs, and the sandbox's network proxy only lets a
  command reach the hosts you allow, so keep your git host off that list.
  noskills does not turn the sandbox on for you, because it changes how every
  command in your sessions runs. To turn it on, add this to
  `.claude/settings.json`:

  ```json
  {
    "sandbox": {
      "enabled": true,
      "allowUnsandboxedCommands": false,
      "filesystem": {
        "denyWrite": ["./.git", "./.eser/manifest.yml", "./.eser/.state/bin"]
      }
    }
  }
  ```

  `allowUnsandboxedCommands: false` stops the agent from asking to run a command
  outside the sandbox. With the manifest in `denyWrite`, the noskills commands
  that update it fail when the agent runs them; run those yourself.

- Branch protection on the remote: require pull requests for your main branch,
  block force pushes (GitHub branch protection rules or rulesets, GitLab
  protected branches), and do not give agent sessions credentials that can push.

#### The PreToolUse hook in each tool

`noskills init` writes the hook config each tool reads, and each config runs
`noskills invoke-hook pre-tool-use` before the tool's shell and file tools run:

| Tool        | Config                          | Guarded tools                                                                                   |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| Claude Code | `.claude/settings.json`         | Bash, Write, Edit, MultiEdit                                                                    |
| Codex       | `.codex/hooks.json`             | Bash (shell commands and exec_command), apply_patch                                             |
| Copilot CLI | `.github/hooks/noskills.json`   | bash, powershell, create, edit, str_replace_editor, apply_patch                                 |
| Kiro        | `.kiro/hooks/noskills.json`     | write, fs_write, fsWrite, fs_append, str_replace, delete_file, shell, execute_bash, execute_cmd |
| OpenCode    | `.opencode/plugins/noskills.ts` | bash, edit, write, apply_patch                                                                  |

The hook reads each tool's own tool names and input fields. It refuses a call by
exiting with code 2 and writing the reason to stderr, which all five tools take
as a denial. Codex runs a project's hooks only after you trust them: after
`noskills init`, open `/hooks` in Codex and trust the noskills entries. Kiro
reads `.kiro/hooks/` from IDE 1.0 and CLI 3.0 on. Copilot CLI also runs the
hooks in `.claude/settings.json`, so with Claude Code set up as well it runs the
check twice, and both runs refuse the same calls.

The tools' documentation leaves two gaps:

- Copilot CLI documents the `command` argument of its shell tools but not the
  arguments of `create` and `edit`. noskills reads `path`, and `file_text` or
  `old_str` and `new_str` when the call has them.
- Kiro documents its hook payload and tool names but not the fields of each
  tool's input. noskills reads `command` for the shell tools and `path` or
  `file_path` for the write tools, with `file_text`, `content` or `old_str` and
  `new_str` when the call has them.

When a file tool's input does not show what the file holds afterwards (a patch,
an append, a delete or an input of another shape), the phase gate still applies
to the file's path, and a change to `.eser/manifest.yml` is refused as a whole,
since noskills cannot tell whether it leaves the `noskills` section alone. A
shell call whose input has no `command` field goes unchecked.

**When the hook is slow.** Each config gives the PreToolUse hook 30 seconds, as
long as the git wrapper's check. Claude Code, Codex, Copilot CLI and Kiro treat
a hook that does not answer in time as a failed hook and let the tool call go
ahead, so the git guard and the protected-file check do not apply to that call.
The git wrapper, where it is on PATH, still refuses a git write whose own check
times out, and the OpenCode plugin refuses the call and says why. The default
`command`, `npx eser@latest noskills`, can wait on the npm registry before
noskills starts, and `noskills init` warns when `command` runs through npx,
`npm exec` or another runner that downloads a package or a remote module first.
To keep the hook off the network, install the eser CLI (`npm install -g eser`)
and run `eser noskills init`, which sets `command` to `eser noskills`.

The Go build of noskills (`cmd/noskills`, which `make build` builds until the
release channels ship it) makes the 30-second timeout and the warning
unnecessary. It runs every hook and the git wrapper's check itself, answers a
PreToolUse call in about 4 ms, and needs neither Node nor the network. Running
`noskills init` through it sets `command` to the binary, so every hook and the
git wrapper it generates call the binary; run it again in a project that the npx
command set up. The timeout stays at 30 seconds only for configs that still
start noskills through npx, such as the ones v4.5.x wrote.

When a spec's iteration count reaches `maxIterationsBeforeRestart` (default 15),
the Stop hook prints a notice for you on stderr and `noskills next` sets
`restartRecommended: true`. The agent gets no countdown, because the count runs
over the spec's whole life rather than one session.

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

Concerns inject at every phase (DISCOVERY, REFINEMENT, EXECUTING, etc.) — but
only the slice relevant to the current phase. The agent never sees all concern
data at once:

- **DISCOVERY** — extra sub-questions, dream state prompts
- **REFINEMENT** — review dimension checklist (scope-filtered by classification
  — UI dimensions only appear for UI specs)
- **PROPOSAL** — spec sections (a section with a `scope` waits for a matching
  classification), registry table skeletons
- **EXECUTING** — reminders (tier 1 at compile-time, tier 2 per-file via hooks;
  a reminder's `scope` puts it in tier 2), acceptance criteria, tension gates
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
(folder: pkg/@eserstack/noskills/sync) Sync output must be idempotent
(folder: pkg/@eserstack/noskills/sync) Hook scripts must be self-contained
```

Rules stack upward — `.folder-rules.md` files in parent directories also apply,
like CSS specificity. A rule at `pkg/` applies to all files under `pkg/`, while
a rule at `pkg/@eserstack/streams/` applies only to that package. Zero token
cost — derived from filesystem, not LLM.

### Removing noskills and restoring it

`noskills purge` takes noskills out of a project and leaves the rest of the
project alone. It asks about each category; pass `--force` to take every
category without asking, which agent mode requires:

```bash
eser noskills purge                # asks about each category
eser noskills purge --force        # takes every category
eser noskills purge --no-history   # deletes without keeping a copy
```

| Category            | What purge takes                                                                   |
| ------------------- | ---------------------------------------------------------------------------------- |
| `concerns`          | `.eser/concerns/`                                                                  |
| `specs`             | `.eser/specs/` and the workflow state in `.eser/.state/progresses/`                |
| `rules`             | `.eser/rules/`                                                                     |
| `manifest`          | The `noskills` section of `.eser/manifest.yml`, which goes with any other category |
| `agent-integration` | What sync writes for each tool, and noskills' part of the files it shares with you |

For the agent integration, purge removes the files only noskills uses: the agent
definitions (`.claude/agents/`, `.codex/agents/`, `.github/agents/`,
`.kiro/agents/`, `.opencode/agents/`, all named `noskills-*`), the hook files
`.kiro/hooks/noskills.json`, `.github/hooks/noskills.json` and
`.opencode/plugins/noskills.ts`, the rule files `.cursorrules`,
`.windsurfrules`, `.github/copilot-instructions.md` and the `noskills-*` files
in `.kiro/steering/`, and the Kiro and OpenCode copies of each spec
(`.kiro/specs/spec_name/` and `.opencode/skills/spec_name.md`). From the files
you share with noskills it removes only noskills' part: the section in CLAUDE.md
and AGENTS.md, the hooks in `.claude/settings.json` and `.codex/hooks.json`, and
the noskills MCP server in `.codex/config.toml`, `.copilot/mcp.json`,
`.kiro/settings/mcp.json` and `opencode.json`. A shared file with nothing else
left in it, and a folder purge leaves empty, goes too. Sessions and the event
log in `.eser/.state/` stay.

#### Purge history

Purge moves what it removes into a history entry instead of deleting it. An
entry is a folder named after the UTC time of the purge, such as
`.eser/.state/purge-history/2026-10-05T14-03-12-345Z/`, with one folder per
category. Each category folder holds the removed paths at the place they had in
the project, and `manifest/noskills.yml` holds the manifest section. The history
keeps the 5 newest entries, and each purge drops the oldest beyond that.
`.eser/.state/` is git-ignored, so the history stays out of your repository.

If you purge to remove the content from disk, pass `--no-history`: purge then
deletes it without a copy. Entries from earlier purges stay in
`.eser/.state/purge-history/`; delete that folder to remove those copies too.

#### Restoring

`noskills purge restore` lists the history, newest first. In a terminal it then
asks which entry and which categories to restore. Name an entry, or `latest` for
the newest, to restore without questions:

```bash
eser noskills purge restore                       # lists the entries
eser noskills purge restore latest                # every category of the newest entry
eser noskills purge restore entry_id specs rules  # two categories of one entry
eser noskills purge restore latest concerns --overwrite
```

Restore copies, so the entry stays in the history and you can restore from it
again. When a file the entry holds already exists in the project, or the
manifest already has a `noskills` section, restore leaves that category alone,
names the paths and exits with code 1. Pass `--overwrite` to replace them; files
the entry does not hold stay as they are.

The agent integration comes back through sync, the step `noskills init` runs.
Restore copies the tool files back, then sync writes noskills' part of the
shared files (the CLAUDE.md and AGENTS.md sections, the hooks and the MCP
server) for the tools the manifest lists. Sync reads the `noskills` section of
the manifest, so restore `manifest` together with `agent-integration`, or run
`noskills init` first. Restore puts categories back in the order of the table
above, so sync also writes the rules restored in the same run.

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
the sprint starts — not during. That is exactly what noskills does at REFINEMENT
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

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

Run `noskills init` (or `eser noskills init`) once after upgrading. It rewrites
the hook files, the generated rule files and the copies of the built-in concerns
in `.eser/concerns/`, which several entries below depend on.

- `noskills invoke-hook pre-tool-use` refuses a call with exit code 2 and writes
  `noskills: <reason>` to stderr. It used to exit 0 with JSON only; the JSON is
  still on stdout for Claude Code, Codex and Copilot CLI. A script that calls
  the hook treats 2 as a denial:

  ```bash
  noskills invoke-hook pre-tool-use < tool_call.json
  # Before: any non-zero exit meant the hook crashed
  # After: 0 allows the call, 2 refuses it, anything else is a failure
  ```

- Kiro hooks moved from `.kiro/settings/hooks.json`, which Kiro does not read,
  to `.kiro/hooks/noskills.json` in Kiro's v1 format. `noskills init` writes the
  new file and removes noskills' `_noskills` entries from the old one, deleting
  it when nothing else is left. Kiro IDE 1.0 or CLI 3.0 is needed.
- `.codex/hooks.json` uses Codex's event-to-matcher-group format. Codex no
  longer gets a post-ask-user-question hook and now gets a post-bash hook. Run
  `noskills init`, which also converts your own entries, then open `/hooks` in
  Codex and trust the noskills hooks:

  ```jsonc
  // Before: a list of entries
  {
    "hooks": [
      { "event": "PreToolUse", "command": "noskills invoke-hook pre-tool-use" }
    ]
  }
  // After: events map to matcher groups
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "^(Bash|apply_patch)$",
        "hooks": [{
          "type": "command",
          "command": "noskills invoke-hook pre-tool-use",
          "timeout": 30
        }]
      }]
    }
  }
  ```

- `.github/hooks/noskills.json` uses Copilot CLI's camelCase event lists
  (`"preToolUse": [{ "type": "command", "matcher": "...", "command": "...", "timeoutSec": 30 }]`)
  instead of named objects such as `"noskills:preToolUse"` with a `command`
  array, which Copilot CLI rejected. `noskills init` drops the old keys.
- The OpenCode plugin `.opencode/plugins/noskills.ts` exports `NoskillsPlugin`
  instead of `export default`, runs the stop hook on `session.idle` instead of
  `session.deleted`, and refuses a guarded tool call when the PreToolUse check
  times out, fails or cannot start. Run `noskills init`. If the noskills command
  can be missing on a machine, install it there, or remove the plugin file
  (`noskills purge` now removes it).
- In agent mode, `noskills next` in DISCOVERY returns every unanswered base
  question in `questions`, and `currentQuestion` is gone from the output and
  from the `compiler.DiscoveryOutput` type. Send the answers as one JSON object
  keyed by question id; plain text still answers the first open question. Run
  `noskills init` (or sync) so the generated rule files state the new rule:

  ```bash
  # Before: one call per question, read from currentQuestion
  noskills spec checkout-flow next --answer="Orders are copied by hand"
  # After: one call with every answer
  noskills spec checkout-flow next --answer='{"status_quo":"Orders are copied by hand","ambition":"..."}'
  ```

- A JSON answer that holds only some base question ids records those answers; it
  used to be stored, as a whole string, as the answer to the current question. A
  JSON answer whose key is not a base question id, whose value is not a string,
  or that holds no answer is refused with `{error}` and exit code 1. Key each
  answer by `status_quo`, `ambition`, `reversibility`, `user_impact`,
  `verification` or `scope_boundary`.
- Pending follow-ups now keep the base answers from completing discovery. `next`
  hands them out one at a time, and settling the last one moves the spec to
  DISCOVERY_REFINEMENT. `followup <id> --answer` and `--skip` on an id that is
  not a pending follow-up fail with exit code 1 instead of reporting success.
  Register follow-ups before you submit the base answers, then run the command
  `next` gives for each one:

  ```bash
  noskills spec checkout-flow followup status_quo "Which teams copy orders?"
  noskills spec checkout-flow next --answer='{"status_quo":"...",...}'
  noskills spec checkout-flow followup followup_id --answer="Support and sales"
  ```

- noskills no longer guesses where a reminder applies from words in its text
  ("slop", "ui element", "api doc", "migration", "rollback" and others). A
  custom concern that relied on those words now puts those reminders in every
  spec's EXECUTING instruction, and nothing is file-specific without a `scope`.
  Add the scope (`ui`, `api`, `data` or `migration`) to those reminders, and run
  `noskills init` to rewrite the built-in concern copies in `.eser/concerns/`,
  or beautiful-product's UI reminders reach every spec:

  ```jsonc
  // Before
  "reminders": ["Every UI element has an empty state"]
  // After
  "reminders": [
    { "text": "Every UI element has an empty state", "scope": ["ui"] }
  ]
  ```

- Built-in concerns changed where their content applies. Three beautiful-product
  reminders (empty states, landing page rules, design rating rubric) and
  qa-tested's Health Score Rubric now need a `ui` spec, and compliance's three
  PII and data reminders a `data` spec. developer-experience DX Principle 1 and
  documented's migration-guide reminder need `involvesMigration`. peer-reviewed
  Suppressions, ship-ready CHANGELOG, deploy-ready Rollback plan and
  production-ready Runbook moved from the per-edit hook into the EXECUTING
  instruction. The sections compliance data-handling and retention-policy
  (`data`), documented api-documentation (`api`) and long-lived
  migration-deprecation (`migration`) stay hidden until the classification has
  the flag. A spec already in flight shows the change when its classification is
  next applied. Run `noskills init` to refresh the copies in `.eser/concerns/`.
- A concern file with an unknown or malformed `scope`, such as `"UI"` or a value
  that is not a list, is refused: `persistence.listConcerns` skips it with a
  stderr warning naming the file and entry, `concerns.loadConcerns` throws, and
  `noskills pack install` of a remote pack stops. Before: `"scope": "UI"`.
  After: `"scope": ["ui"]`, with values from `ui`, `api`, `data` and
  `migration`.
- `noskills purge` moves what it removes into
  `.eser/.state/purge-history/<entry_id>/` and keeps the 5 newest entries,
  instead of deleting it. To remove the content from disk, pass `--no-history`,
  and delete `.eser/.state/purge-history/` to drop copies from earlier purges.
  Before: `noskills purge --force`. After:
  `noskills purge --force --no-history`.
- `noskills purge` refuses arguments it does not know, with exit code 1; it used
  to ignore them. Only `--force`, `--no-history`, the mode flags and the
  `restore` subcommand are accepted. Drop any other argument.
- `noskills purge` exits with code 1 when a category could not be fully removed,
  and names each path and the reason; it used to exit 0 and say nothing. A
  script treats exit 1 as a partial purge and reads the output.
- Purge's `agent-integration` category takes more files: the agent files for
  Codex, Copilot CLI, Kiro and OpenCode, Kiro's `noskills-*` steering files, the
  `.kiro/specs/<spec>/` and `.opencode/skills/<spec>.md` copies of each spec,
  noskills' section of AGENTS.md, and the noskills MCP server in
  `.codex/config.toml`, `.copilot/mcp.json`, `.kiro/settings/mcp.json` and
  `opencode.json`. A shared file left empty, such as a CLAUDE.md that only held
  the noskills section, is deleted, and so is a folder purge leaves empty. To
  get a file back, run
  `noskills purge restore latest manifest agent-integration`.
- The PreToolUse hook refuses agent edits and Bash commands that change the
  `noskills` section of `.eser/manifest.yml`, leave the manifest unparseable,
  write under `.eser/.state/bin/`, or move or remove `.eser` or `.eser/.state`
  as a whole (`rm -rf .eser/.state`, `mv .eser x`), in every phase and session
  mode. Change that section yourself, run `noskills concern add` or
  `concern remove`, and use `noskills purge` for cleanup.
- With `allowGit` false, agent sessions (Claude Code through the SessionStart
  hook, and `noskills run`) refuse at exec time every git write to the project's
  repository and every push from any repository. That includes writes started by
  tools, such as `gh pr create`, `npm version` or lint-staged. A git command
  whose first argument is a global option the guard does not know (such as
  `--list-cmds=...`) is refused too. Set `allowGit: true` in
  `.eser/manifest.yml`, or run those commands outside the agent session.
- `allowGit` counts as on only when it is the boolean `true`, in the hooks,
  `noskills run` and `noskills sync`. Before: `allowGit: "yes"` turned the guard
  off. After: write `allowGit: true`.
- The git wrapper refuses a command when the noskills check does not answer
  within 30 seconds; it used to wait with no limit. If the check is slow because
  `command` is `npx eser@latest noskills`, set `command` in `.eser/manifest.yml`
  to an installed noskills, such as `eser noskills`.
- `noskills run` commits whenever `autoCommit: true` is set, also when
  `allowGit` is false. Its commits include untracked files, run at the project
  root and use the message `noskills: iteration N: <progress>`. Set
  `autoCommit: false` (or remove it) to keep the loop from committing.
- Generated `.cursorrules`, `.windsurfrules` and
  `.github/copilot-instructions.md` use `<prefix> spec <name> next` forms. Run
  sync again instead of editing the generated files.
- `noskills next` JSON no longer has `behavioral.urgency` or
  `restartInstruction`, and the TypeScript types `compiler.BehavioralBlock` and
  `compiler.ExecutionOutput` lost the fields. Read `restartRecommended` on the
  EXECUTING output and show your own notice. `behavioral.modeOverride` for
  DISCOVERY, DISCOVERY_REFINEMENT and SPEC_PROPOSAL is "plan mode", and the
  read-only rule appears once in `behavioral.rules`.

## License

Apache-2.0

## 🔗 Links

- [README-HOW.md](./README-HOW.md): the state machine, JSON output, hooks, CLI
  reference and library API
- [`@eserstack/noskills-web`](https://github.com/eser/stack/tree/main/pkg/@eserstack/noskills-web):
  the web dashboard for noskills specs and agent tabs
- [`@eserstack/agents`](https://github.com/eser/stack/tree/main/pkg/@eserstack/agents):
  coding-agent discovery and the read-only git guard the hooks use
- [JSR package](https://jsr.io/@eserstack/noskills): the API reference generated
  from source
- [eser/stack on GitHub](https://github.com/eser/stack)
