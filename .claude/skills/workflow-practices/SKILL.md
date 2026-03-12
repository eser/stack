---
name: workflow-practices
description: "Task execution workflow: implementation steps, git commit policy, quality gates, and code ownership. Use when planning tasks, making git commits, or running validation checks."
---

# Workflow Practices

## Quick Start

1. Read codebase -> Create todo list -> Check plan -> Execute
2. NEVER revert user changes or overwrite intentional code
3. Do NOT create git commits unless explicitly requested
4. Run `make ok` before considering work complete

## Key Principles

- Work WITH user changes, not against them
- Fully implement all functionality (no placeholders)
- Be concise, minimize prose
- If uncertain, say so
- Respect project's tooling decisions

## Anti-Patterns

**"I'll revert the user's code to fix this"**
No. Never overwrite intentional user changes. Work with their code.

**"Let me just commit these changes"**
No. Never create commits unless explicitly requested by the user.

**"I'll skip validate, it's a small change"**
No. Run `make ok` before considering any work complete.

## References

See [rules.md](references/rules.md) for complete conventions.
