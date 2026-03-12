# Skill Discovery & Invocation

Mandatory skill identification and invocation at every conversation start.

---

## The Non-Negotiable Rule

**Invoke relevant skills BEFORE any response or action.**

This includes:
- Before answering questions
- Before asking clarifying questions
- Before exploring code
- Before making suggestions

Even 1% probability of skill relevance requires checking first.

---

## Discovery Workflow

```
1. Receive user message
2. Scan for skill triggers (keywords, file types, task types)
3. Identify ALL potentially relevant skills
4. Invoke skills using Skill tool
5. Announce: "Applying skills: [list]"
6. Follow skill instructions
7. Then respond to user
```

### Example

User: "Add a new API endpoint for user preferences"

Before responding:
```
Applying skills: javascript-practices, workflow-practices, security-practices
```

Then proceed with the task following those skill guidelines.

---

## Skill Trigger Keywords

| Skill                       | Trigger Keywords/Patterns                         |
| --------------------------- | ------------------------------------------------- |
| `javascript-practices`      | .ts, .tsx, .js, React, TypeScript, module, import |
| `go-practices`              | .go, Go, hexagonal, service, repository           |
| `workflow-practices`        | implement, add, fix, refactor, task, commit       |
| `requirement-clarification` | unclear, multiple ways, should I, which approach  |
| `security-practices`        | auth, password, secret, token, validation, CORS   |
| `ci-cd-practices`           | deploy, CI, GitHub Actions, Kubernetes, pipeline  |
| `tooling-standards`         | deno, npm, package.json, config, lint, format     |
| `coding-practices`          | error handling, validation, testing, DRY          |
| `architecture-guidelines`   | structure, design, ADR, hexagonal, layers         |

---

## Skill Prioritization

When multiple skills apply, invoke in this order:

1. **Process skills first** (determine approach)
   - `requirement-clarification` - clarify before implementing
   - `workflow-practices` - establish execution plan

2. **Implementation skills second** (guide execution)
   - `javascript-practices`, `go-practices` - language conventions
   - `security-practices` - security requirements
   - `coding-practices` - quality standards

3. **Operational skills last** (deployment/CI)
   - `ci-cd-practices` - pipeline and deployment

---

## Skill Types

### Rigid Skills (Follow Exactly)

These skills have strict workflows that must be followed step-by-step:

- `workflow-practices` - git commit process
- `ci-cd-practices` - deployment procedures
- `security-practices` - security requirements

### Flexible Skills (Adapt Principles)

These skills provide guidelines to adapt contextually:

- `javascript-practices` - coding conventions
- `go-practices` - architectural patterns
- `coding-practices` - general quality

---

## Red Flag Rationalizations

Stop immediately if you're thinking any of these:

**"I'll just answer quickly first"**
No. Skills come before ANY response.

**"This is just a simple question"**
Questions still require skill context. Check first.

**"I already know how to do this"**
Your knowledge doesn't replace documented workflows.

**"I'll check skills after gathering more info"**
Wrong order. Skills first, then information gathering.

**"No skills seem directly relevant"**
If even 1% might apply, check. `workflow-practices` applies to almost everything.

**"The user seems in a hurry"**
Speed doesn't override process. Skills prevent costly mistakes.

**"I'll mention skills later"**
Invoke at start. Later is too late.

---

## Common Mistakes

### Mistake 1: Responding Before Invoking

```
❌ Wrong:
User: "Fix the login bug"
Claude: "I'll look at the login code..." [no skill invocation]

✅ Correct:
User: "Fix the login bug"
Claude: "Applying skills: workflow-practices, security-practices, javascript-practices"
[Then proceeds with investigation]
```

### Mistake 2: Asking Questions Before Invoking

```
❌ Wrong:
User: "Add caching to the API"
Claude: "What caching strategy do you prefer?" [no skill invocation]

✅ Correct:
User: "Add caching to the API"
Claude: "Applying skills: requirement-clarification, javascript-practices"
[requirement-clarification guides how to ask about caching strategy]
```

### Mistake 3: Invoking Only Obvious Skills

```
❌ Wrong:
User: "Write a Go service for notifications"
Claude: "Applying skills: go-practices" [missed others]

✅ Correct:
Claude: "Applying skills: go-practices, architecture-guidelines,
         workflow-practices, security-practices"
```

---

## Verification Checklist

Before every response, verify:

- [ ] Scanned message for ALL potential skill triggers
- [ ] Invoked relevant skills using Skill tool
- [ ] Announced which skills are active
- [ ] Following skill instructions in my response
- [ ] Not rationalizing skipping any skills

---

## Meta-Rule

If uncertain whether a skill applies: **invoke it anyway**.

The cost of unnecessary invocation is minimal.
The cost of missing a relevant skill can be significant.

Default to inclusion, not exclusion.
