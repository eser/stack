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
- Start with action, follow with "Use when..." trigger phrase
- Include keywords: error messages, symptoms, tool names, synonyms

Correct:

```yaml
description: JavaScript and TypeScript conventions for syntax, modules, types, and runtime behavior. Use when writing or reviewing JS/TS code, implementing modules, handling types, or working with runtime APIs.
```

```yaml
description: Conventions for adding routes, middleware, and handlers. Use when adding new endpoints, modifying routing, or implementing API handlers.
```

Incorrect:

```yaml
description: JavaScript stuff # Too vague, no trigger context
```

```yaml
description: Helps with routing stuff # Missing "Use when..." trigger, too vague
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

## Anti-Rationalization Sections

Bulletproof discipline-enforcing skills by adding explicit counters.

### Pattern

```markdown
## Anti-Patterns

**"This is a special case"**
No. The rule applies to ALL cases. Ask for explicit exception approval.

**"I already tested it manually"**
Manual testing doesn't replace automated tests. Run the test suite.

**"Being pragmatic means adapting"**
Pragmatism doesn't mean skipping quality gates. Follow the process.
```

### Red Flags List

Include warning signs that indicate rule-breaking temptation:

```markdown
## Red Flags

Stop and reconsider if you're thinking:
- "Just this once..."
- "The user won't notice..."
- "I can fix it later..."
- "It's close enough..."
```

---

## Terminology Consistency

Pick one term per concept; use throughout the skill.

| Concept       | Pick ONE | Avoid mixing                |
| ------------- | -------- | --------------------------- |
| API paths     | endpoint | URL, route, path            |
| Form elements | field    | input, box, element         |
| Data action   | extract  | pull, get, fetch, retrieve  |
| Error action  | return   | throw, raise, emit          |

---

## Degrees of Freedom

Match instruction specificity to task fragility.

**High Freedom** (multiple valid approaches):

```
Choose an appropriate data structure for the use case.
```

**Medium Freedom** (preferred patterns with flexibility):

```
1. Validate input
2. Transform data
3. Return result or error
```

**Low Freedom** (exact steps required):

```
Run exactly: `make lint && make test`
Do not modify or skip steps.
```

---

## Skills Inventory

See the `eser-rules-manager` SKILL.md for the full skill table.
Create new skills for: `ui/`, `testing/` when needed.
