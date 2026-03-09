---
name: eser-rules-manager
description: Skill discovery and rule management. Use when starting any conversation to identify applicable skills, and when user states preferences or asks to add/modify rules.
---

# Skill Discovery & Rule Management

## Skill Discovery (Mandatory)

**Before ANY response** (including clarifying questions):
1. Scan user message for applicable skills
2. Invoke relevant skills using Skill tool
3. Announce: "Applying skills: [list]", then respond

Even 1% probability requires checking skills first. This is not optional.

## Rule Management

1. Identify scope → choose skill (or create new)
2. Update rule in `.claude/skills/<name>/references/rules.md`

## Available Skills

| Skill                       | Triggers                                        |
| --------------------------- | ----------------------------------------------- |
| `eserstack-monorepo`        | Package structure, versions, adding packages    |
| `agent-guidelines`          | Agent roles, safety rules, cross-package changes|
| `release-management`        | Version bumps, releases, publishing             |
| `architecture-guidelines`   | System design, ADRs, testing strategy           |
| `design-principles`         | Pure functions, immutability, composition       |
| `coding-practices`          | Error handling, validation, DRY, explicit checks|
| `javascript-practices`      | JS/TS code, modules, types, React patterns      |
| `go-practices`              | Go code, hexagonal architecture                 |
| `tooling-standards`         | Deno, JSR registry, config files                |
| `security-practices`        | Auth, secrets, validation, SSRF                 |
| `workflow-practices`        | Task execution, git commits                     |
| `ci-cd-practices`           | GitHub Actions, Kubernetes, deployments         |
| `requirement-clarification` | Unclear scope, multiple approaches              |

## References

- [skill-discovery.md](references/skill-discovery.md) - Mandatory invocation rules
- [skill-format.md](references/skill-format.md) - Creating/updating skills
- [skill-testing.md](references/skill-testing.md) - TDD for skills
