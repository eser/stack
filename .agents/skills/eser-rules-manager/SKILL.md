---
name: eser-rules-manager
description: "Picks the skills a task needs and maintains the rules in .agents/skills. Use when starting any task to choose skills, when the user states a preference or a rule to remember, or when creating, changing, splitting, validating or evaluating a skill."
---

# Skill Discovery and Rule Management

Chooses which skills apply to a task, and says how rules are added and kept in
order.

## Always

- Load every skill that might apply before the first answer or question, and
  name them: a skill loaded late cannot change the plan
- A new rule goes into the one skill that owns the topic; other skills point to
  it as `skill-name: Exact Section Title`
- Write only what a strong model would not do by default here: project choices,
  real paths and commands, and the reason for each rule
- Every example follows the other skills' rules
- SKILL.md stays an overview of at most 80 lines that links every reference file
  with a "Read when"
- Run `node .agents/skills/eser-rules-manager/scripts/validate-skills.ts --fix`
  after every skill change
- A change meant to alter behavior is evaluated against a snapshot of the old
  skill

## Available Skills

| Skill                       | Covers                                                |
| --------------------------- | ----------------------------------------------------- |
| `enrichment`                | Round-based interview until no decision is left open  |
| `handoff`                   | `/handoff`: a document a fresh session continues from |
| `workflow-practices`        | Clarifying, roles, approvals, task flow, gates        |
| `architecture-guidelines`   | Hexagonal layers, API surface, testing, ADRs          |
| `design-principles`         | Pure functions, immutability, interfaces, clocks      |
| `coding-practices`          | Errors, logging, resources, config, readability       |
| `javascript-practices`      | TS/JS modules, types, async, React                    |
| `go-practices`              | Go conventions, context, data structures, perf        |
| `security-practices`        | Secrets, input, SSRF, injection, LLM trust boundary   |
| `tooling-standards`         | Tooling, dependencies, scripts, naming, packages      |
| `documentation-conventions` | READMEs, docs and prose style                         |
| `release-and-ci`            | Versions, releases, publishing, workflows, deploys    |

## References

| File                                                  | Read when                                          |
| ----------------------------------------------------- | -------------------------------------------------- |
| [skill-discovery.md](references/skill-discovery.md)   | Unsure which skills a task needs                   |
| [skill-format.md](references/skill-format.md)         | Writing or restructuring a skill or a rule         |
| [skill-evaluation.md](references/skill-evaluation.md) | Testing that a skill changes behavior and triggers |
