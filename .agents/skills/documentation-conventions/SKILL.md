---
name: documentation-conventions
description: "Covers package READMEs, project docs and plain prose: namespace imports in examples, emoji and detail preservation, where docs live, docs that change with the code, and no empty qualifiers, unbacked claims, em dashes or generated rhythm. Use when writing or editing READMEs, docs, skill files, ADR text, backlog items, changelog entries, commit messages or code comments."
---

# Documentation Conventions

Rules for what the repository's documents say and how they say it.

## Always

- README examples use namespace imports of the package root
  (`import * as functions from "@eserstack/functions"`), never sub-path imports.
- Never remove existing emojis (🧱 or ⚡ titles, 🔗 links footer) or descriptive
  details such as "(LIFO cleanup)".
- The documentation diff ships in the same change as the code it describes; edit
  JSDoc, never the generated `docs/api/`.
- No empty qualifiers (comprehensive, seamless, robust), no claim, number or
  quote that is not in the repo, no em dashes in new or edited text.
- Before delivering, read the text as a stranger: what looks generated, and
  which fact has no source? Fix both.

## References

| File                                | Read when                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| [readmes.md](references/readmes.md) | Writing a README, adding docs, changing a documented surface          |
| [prose.md](references/prose.md)     | Writing or reviewing any prose: docs, skills, commits, backlog, notes |
