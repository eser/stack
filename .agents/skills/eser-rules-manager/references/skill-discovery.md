# Skill Discovery

Which skills to load for a task, and in what order.

---

## Load Before Responding

Scope: Every task, including questions and clarifying questions

Rule: Before the first answer, question or file read, load every skill that
might apply (a small chance is enough) and say which ones you are applying:
`Applying skills: workflow-practices, go-practices, security-practices`. A skill
loaded after the plan is made cannot change the plan. Loading one that turns out
not to matter costs little.

Look past the obvious one. "Write a Go service for notifications" needs
go-practices, and also architecture-guidelines (layers), security-practices
(input and secrets) and workflow-practices (steps and gates).

**Why:** agents tend to under-load skills; the ones missed are the ones whose
rules were broken.

---

## Skill Trigger Keywords

| Skill                       | Trigger keywords and patterns                                    |
| --------------------------- | ---------------------------------------------------------------- |
| `enrichment`                | enrich, grill, stress-test, interrogate a plan or idea           |
| `handoff`                   | user-invoked only: `/handoff [next focus]`                       |
| `workflow-practices`        | any file change, vague request, review, push, tag, delete        |
| `architecture-guidelines`   | structure, layers, hexagonal, ADR, test strategy                 |
| `design-principles`         | pure function, immutability, interfaces, clock, cancel           |
| `coding-practices`          | errors, logging, timeouts, config, naming, comments              |
| `javascript-practices`      | .ts, .tsx, .js, React, imports, async, types                     |
| `go-practices`              | .go, pkg/ajan, context, golangci-lint, benchmarks                |
| `security-practices`        | auth, secret, token, input, SSRF, injection, LLM input           |
| `tooling-standards`         | dependency, package.json, new package, file name, license header |
| `documentation-conventions` | README, docs, JSDoc, changelog prose, backlog text               |
| `release-and-ci`            | release, version bump, JSR or npm publish, workflow, CI, deploy  |
| `eser-rules-manager`        | new rule, preference, create or change a skill, evals            |

---

## Order

When several skills apply, apply them in this order:

1. Process: workflow-practices (clarifying, approvals, steps and gates).
2. Design and implementation: architecture-guidelines, design-principles, the
   language skill, coding-practices, security-practices.
3. Delivery: release-and-ci.

Process and safety skills are followed as written (commit policy, quality gates,
release steps). Design and language skills state defaults that the code around
the change may refine.
