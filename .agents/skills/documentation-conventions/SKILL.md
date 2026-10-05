---
name: documentation-conventions
description: "Documentation conventions of this codebase: READMEs with namespace-import examples and emoji titles, docs that change with the code, page structure, code examples, placeholders, doc review, and plain prose without filler, unbacked claims, em dashes or AI tells. Use when writing, editing or reviewing READMEs, docs, guides, skills, ADRs, backlog items, changelogs, commit messages or code comments."
---

# Documentation Conventions

Rules for what this codebase's documents say, how a page is shaped, and how its
sentences read.

## Always

- README examples use namespace imports of the package root
  (`import * as pkg from "@scope/pkg"`), never sub-path imports; a package whose
  `.` export is its CLI is imported from `/mod`.
- Never remove existing emojis (🧱 or ⚡ titles, 🔗 links footer) or descriptive
  details such as "(LIFO cleanup)".
- The documentation diff ships in the same change as the code it describes; edit
  JSDoc, never a generated API reference.
- No empty qualifiers (comprehensive, seamless, robust), no claim, number or
  quote without a source the reader can open, no em dashes in new or edited
  text.
- A docs page does one job (tutorial, how-to, reference, conceptual or
  troubleshooting), opens with what it covers and for whom, and its headings say
  what each section holds.
- Every code block has a language tag and prose that explains it. A value the
  reader replaces is a `snake_case` placeholder such as `your_access_token`,
  never `<TOKEN>` or `xxx`.
- Reader-facing docs address the reader as "you" and give steps as imperatives.
- Before delivering, read the text as a stranger: what looks generated, and
  which fact has no source? Fix both.

## References

| File                                              | Read when                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| [readmes.md](references/readmes.md)               | Writing a README, adding docs, changing a documented surface               |
| [prose.md](references/prose.md)                   | Writing or reviewing any prose: docs, skills, commits, backlog, notes      |
| [docs-structure.md](references/docs-structure.md) | Shaping a docs page, writing code examples or placeholders, reviewing docs |
