# eserstack Development Guidelines

All development rules live in `.claude/skills/`. Load relevant skills before
starting any task.

## Skill Map

| When you need to...                     | Load skill                  |
| --------------------------------------- | --------------------------- |
| Discover which skills apply             | `eser-rules-manager`        |
| Understand the monorepo or add packages | `eserstack-monorepo`        |
| Know agent roles, safety, boundaries    | `agent-guidelines`          |
| Bump versions or publish releases       | `release-management`        |
| Design system structure or write ADRs   | `architecture-guidelines`   |
| Write or review code quality            | `coding-practices`          |
| Write or edit READMEs and docs          | `documentation-conventions` |
| Apply FP patterns, composition, async   | `design-principles`         |
| Write JS/TS, modules, React components  | `javascript-practices`      |
| Write Go services                       | `go-practices`              |
| Handle secrets, auth, validation        | `security-practices`        |
| Plan tasks, make git commits            | `workflow-practices`        |
| Work with CI/CD pipelines               | `ci-cd-practices`           |
| Configure Deno, JSR, build tools        | `tooling-standards`         |
| Clarify ambiguous requirements          | `requirement-clarification` |

## Essential Commands

```bash
deno task cli ok       # Full validation (Deno + Go) — run before committing
deno task cli --help   # Show all available commands
deno task cli go-ok    # Go-only validation
```

## Absolute Rules

- Run `deno task cli ok` before committing (runs
  `deno task cli workflows run -e precommit`)
- One package per task — load `agent-guidelines` for cross-package protocol
- TS packages share one version — load `release-management` for bumping
- Go modules use independent git-tag versioning (NOT the version-bump script)
- Business logic stays dependency-free (hexagonal architecture)

<!-- noskills:start -->

## noskills orchestrator

State-driven orchestration. Do NOT read `.eser/` files directly — noskills
provides everything via JSON.

### Protocol

    deno task cli nos spec <name> next                           # get instruction
    deno task cli nos spec <name> next --answer="response"       # submit and advance
    deno task cli nos spec new "description"                     # create spec (name auto-generated)

Every spec command MUST include `spec <name>`. Use `deno task cli nos spec list`
for available specs.

### Core rules

- Call noskills ONCE per interaction. One question, one answer, one submit.
- Call `next` at: conversation start, before file edits, after completing work,
  at decisions.
- Never batch-submit. Never answer discovery questions yourself.
- Never skip steps or infer decisions. Ask first. Explicit > Clever.
- NEVER suggest bypassing or skipping noskills. Discovery is not overhead.
- NEVER ask permission to run the next noskills command. After spec new → run
  next. After approve → run next. Each step has one next step. Just run it.
- Execute noskills commands IMMEDIATELY — the output has all context needed.
- Display `roadmap` before content. Display `gate` prominently.

### Interactive choices

- Use AskUserQuestion for `interactiveOptions`. Use `commandMap` to resolve
  selections.
- On recurring patterns or corrections: ask 'Permanent rule?' →
  `deno task cli nos rule add "description"`.

### Git

Read-only: log, diff, status, show, blame. No write commands (commit, push,
checkout, etc.).

### Discovery

Listen first: after spec creation, ask user to share context before mode
selection. Modes: full (default), validate, technical-depth, ship-fast, explore.
Pre-scan codebase before questions. Challenge premises. Propose alternatives.
With --from-plan: extract answers, present for user confirmation.

### Execution

- Re-read files before and after editing. Files >500 LOC: read in chunks.
- Run type-check + lint after every edit. Never mark AC passed if type-check
  fails.
- If search returns few results, re-run narrower — assume truncation.
- Clean dead code before structural refactors on files >300 LOC.
- Complete the spec — no mid-execution pauses or checkpoints.
- `meta` block has resume context for session start or after compaction.

<!-- noskills:end -->
