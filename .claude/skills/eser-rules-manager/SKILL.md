---
name: eser-rules-manager
description: Manages development practice rules. Use when user states a preference, practice, or approach to add as a rule. Also use when user asks to add, modify, or categorize rules covering coding, architecture, tooling, or best practices.
---

# eser-rules: Development Practices Manager

Manages development rules across skills. Before working, apply all rules in
`.claude/skills/*/SKILL.md`.

## Quick Start

1. Identify scope → choose skill (or create new)
2. Add/update rule in `.claude/skills/<name>/references/rules.md`
3. Update `.claude/skills/<name>/SKILL.md` key principles if needed
4. Validate: `npx -y claude-skills-cli validate .claude/skills/<name>`

## Skill Format

- **SKILL.md**: <50 lines, Quick Start + Key Principles + References
- **references/**: Detailed rules with Correct/Incorrect examples
- **Frontmatter**: `name` (kebab-case), `description` (<1024 chars)

## Rule Format (in references/)

```
## Section Name

Scope: applicable context
Rule: concise statement

Correct:
example

Incorrect:
example
```

## Skills by Scope

`architecture-guidelines`, `design-principles`, `coding-practices`,
`javascript-practices`, `tooling-standards`

## References

See [skill-format.md](references/skill-format.md) for complete skill format
requirements.
