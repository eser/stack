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
