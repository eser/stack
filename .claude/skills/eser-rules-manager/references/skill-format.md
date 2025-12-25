# Claude Skills Format Requirements

Complete reference for creating and maintaining Claude Skills.

## Directory Structure

```
skill-name/
├── SKILL.md              # Required: Main skill file (<50 lines)
└── references/           # Optional: Detailed documentation
    └── rules.md          # Detailed rules with examples
```

---

## YAML Frontmatter

Required fields at the top of SKILL.md:

```yaml
---
name: skill-name
description: What it does and when to use it
---
```

### name Field

- Lowercase letters, numbers, hyphens only
- Max 64 characters
- Must be unique across all skills

Correct: `javascript-practices`, `eser-rules-manager` Incorrect:
`JavaScript_Practices`, `my skill`

### description Field

- Max 1024 characters (target <200 for efficiency)
- Must include WHAT the skill does AND WHEN to use it
- Include trigger keywords for discovery

Correct:

```yaml
description: JavaScript and TypeScript conventions for syntax, modules, types, and runtime behavior. Use when writing or reviewing JS/TS code, implementing modules, handling types, or working with runtime APIs.
```

Incorrect:

```yaml
description: JavaScript stuff # Too vague, no trigger context
```

---

## SKILL.md Body Requirements

### Limits

- **Max 50 lines** (hard limit)
- Max 1000 words
- 1-2 code examples recommended
- 3-5 sections recommended

### Required Sections

1. **Title** (H1): Matches skill name
2. **Quick Start**: Essential usage in 3-5 steps
3. **Key Principles**: Bullet points of core rules
4. **References**: Links to detailed documentation

### Example Structure

```markdown
# Skill Title

Brief intro (1-2 sentences).

## Quick Start

Minimal steps to use this skill.

## Key Principles

- Bullet point 1
- Bullet point 2
- Bullet point 3

## References

See [rules.md](references/rules.md) for complete guidelines.
```

---

## Progressive Disclosure

Skills use 3-level loading for token efficiency:

**Level 1 - SKILL.md (Always Loaded)**

- Quick overview and key principles
- Kept under 50 lines
- Loaded when skill is discovered

**Level 2 - references/ (Loaded on Demand)**

- Detailed rules with Correct/Incorrect examples
- Read only when Claude needs specifics
- Can be extensive (100+ lines)

**Level 3 - Supporting Files (Loaded on Demand)**

- Scripts, templates, configs
- Located in scripts/, templates/
- Read only when explicitly needed

---

## references/ Directory

Store detailed documentation that's loaded only when needed.

### Common Files

- `references/rules.md` - Detailed rules with examples
- `references/guide.md` - Comprehensive implementation guide
- `references/examples.md` - Extended examples

### Linking from SKILL.md

```markdown
## References

See [rules.md](references/rules.md) for complete guidelines.
```

### Rule Format in references/

````markdown
## Section Name

Scope: applicable context

Rule: concise statement

Correct:

```code
example
```
````

Incorrect:

```code
example
```

````
Use `---` to separate major sections.

---

## Validation

Always validate after creating or modifying a skill:

```bash
npx -y claude-skills-cli validate .claude/skills/<skill-name>
````

### Validation Checks

| Check         | Requirement              |
| ------------- | ------------------------ |
| YAML Syntax   | Valid YAML, no tabs      |
| name          | kebab-case, max 64 chars |
| description   | Under 1024 chars         |
| SKILL.md body | Under 50 lines           |
| File location | Correct path structure   |

### Common Errors

**"SKILL.md body is X lines (MAX: 50)"** → Move detailed content to references/

**"Description is X characters (recommended: <200)"** → Shorten description,
move details to SKILL.md body

**"Missing Quick Start section"** → Add `## Quick Start` with minimal usage
steps

**"No references/ links found but SKILL.md is large"** → Split content into
references/ files

---

## Creating a New Skill

1. Create directory: `.claude/skills/skill-name/`
2. Create `SKILL.md` with frontmatter and sections
3. Create `references/rules.md` with detailed rules
4. Validate: `npx -y claude-skills-cli validate .claude/skills/skill-name`
5. Test: Ask Claude questions that should trigger the skill

---

## Updating Existing Skills

1. Edit `references/rules.md` for detailed rule changes
2. Update `SKILL.md` key principles if needed
3. Validate after changes
4. Keep SKILL.md under 50 lines

---

## Skills in This Project

| Skill                     | Scope                                     |
| ------------------------- | ----------------------------------------- |
| `architecture-guidelines` | System design, ADRs, testing              |
| `design-principles`       | Pure functions, immutability, composition |
| `coding-practices`        | Error handling, validation, DRY           |
| `javascript-practices`    | JS/TS syntax, modules, types, runtime     |
| `tooling-standards`       | Deno, JSR registry, config files          |
| `eser-rules-manager`      | Managing all skills above                 |

Create new skills for: `ui/`, `security/` when needed.
