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

This project uses noskills for state-driven orchestration. Do NOT read
`.eser/rules/`, `.eser/specs/`, or concern files directly. noskills gives you
exactly what you need via JSON output.

### Protocol

    deno task cli noskills next                           # get current instruction
    deno task cli noskills next --answer="your response"  # submit result and advance

### When to call noskills next

You MUST call `deno task cli noskills next` in these situations:

1. At the **START** of every conversation (first thing you do)
2. **BEFORE** creating or modifying any file (to verify you have an active task)
3. **AFTER** completing a logical unit of work (to report progress)
4. When you encounter a **DECISION** that affects architecture or scope
5. When you are **UNSURE** what to do next

NEVER proceed with implementation without checking noskills first. NEVER make
architectural decisions independently — noskills routes them to the user.

### Git is read-only

You MUST NOT run git write commands: commit, add, push, checkout, stash, reset,
merge, rebase, cherry-pick. The user controls git. You control files. You MAY
read from git: log, diff, status, show, blame.

### Convention discovery

When you discover a pattern, receive a correction, or identify a recurring
preference from the user, ask: "Should this be a permanent rule for this
project, or just for this task?" If permanent, run:
`deno task cli noskills rule add
"<description>"`. If just this task, note it
and move on. Never write to `.eser/rules/` directly.

### JSON output

noskills returns JSON with a `phase` field and phase-specific instructions. The
`meta` block contains resume context - use it to orient yourself, especially
after compaction or at the start of a new session. Follow the `instruction`
field. Use `transition` commands to advance state.

<!-- noskills:end -->
