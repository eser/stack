---
name: agent-guidelines
description: Agent roles, safety rules, file ownership, and cross-package change protocol. Use when AI agents work on this codebase, plan multi-package changes, or need boundary guidance.
---

# Agent Guidelines

Rules for AI coding agents working on the eserstack monorepo.

## Quick Start

1. Work within **one package at a time** unless cross-package change is justified
2. Check **Safety Rules** before any action (Never Do / Ask First / Always Do)
3. Run `deno task validate` before considering work complete
4. Follow existing patterns in the target package

## Agent Roles

- **Implementer:** Write code in one package, run validate, follow conventions
- **Reviewer:** Read-only analysis, check skill adherence, verify coverage
- **Architect:** Plan cross-package changes, create ADRs in `etc/adrs/`

## Safety Rules

**Never Do:** destructive git, modify outside assigned package, edit versions manually, weaken types, skip hooks, commit secrets

**Ask First:** cross-package deps, new external deps, CI/CD changes, `@eser/standards` changes, publishing config

**Always Do:** run validate, follow existing patterns, write tests, use explicit extensions, keep functions pure

## References

See [rules.md](references/rules.md) for file ownership, cross-package protocol, and detailed safety rules.
