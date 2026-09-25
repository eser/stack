# Architectural Decision Records

When to write an ADR and what it contains.

---

## Architectural Decision Records

Scope: Decisions that change a package's architecture, a public contract, a
dependency with lasting cost, or a product target

Rule: Record the decision in `docs/adr/NNNN-kebab-title.md`, numbered after the
highest existing file (`0001-http3-and-webtransport.md` through
`0004-bundler-external-import-specifiers.md` exist). An ADR is written before or
with the change, not after. It states:

- `## Status`: Proposed, Accepted, or Superseded by a named ADR.
- `## Context and Problem Statement`: the forces and the question being decided.
- `## Decision Drivers`: what the decision optimizes for.
- `## Considered Options`, with the trade-offs of each.
- `## Decision Outcome`: the choice and why it beat the others.
- `## Consequences`: what becomes easier and what becomes harder.
- `## Links` and related files, when there are any.

An accepted ADR is not rewritten to match a later decision. A new ADR supersedes
it, and the old one's status names the new one.

**Why:** the reasoning behind a structure is what a later change needs, and it
is the part the code cannot show.
