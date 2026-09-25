# Clarifying Questions

When to ask before implementing, when to proceed on a stated assumption, and how
to ask.

---

## Ask, Assume or Proceed

Scope: Before implementing any non-trivial change

Rule:

```
Is the requirement clear?
├── yes → proceed
└── no → are there several valid approaches with different consequences?
    ├── yes → present them with trade-offs and a recommendation, ask
    └── no → is information missing that changes the result?
        ├── yes → ask specific questions
        └── no → state the assumption and proceed unless corrected
```

**Ask** when the answer changes what gets built:

- architecturally different implementations exist;
- business rules have unclear edge cases (soft or hard delete, who may do it);
- existing behavior, a public API or a persisted format would change;
- a security, data-loss or performance trade-off has to be chosen;
- the scope has no boundary ("add a feature" without details);
- the action is on the Ask First list (roles-and-boundaries.md: Ask First).

When the user asks for a full interview about a plan, switch to the enrichment
skill. When you draft a plan yourself (a PRD, spec, ADR or the content of a
backlog item) and it has more open decisions than one round of questions
settles, offer an enrichment session instead of guessing: it works through the
decisions level by level and asks before each deeper level. If the user
declines, write the open decisions into the draft as stated assumptions.

**Do not ask** about naming, formatting or anything the codebase, the skills or
the linters already decide, or when the user said to use your judgment.

---

## How to Ask

Scope: Every clarifying question

Rule:

- Ask before writing code, not after.
- Ask everything related in one message; never drip questions one at a time.
- Make each question specific and answerable: "Should deleting a session also
  delete its ledger entries?", not "How should this work?".
- For a choice between options, list 2 to 4, each with its consequence, and put
  the recommended one first. Use the AskUserQuestion tool when the options are
  discrete.
- Offer the default you would take, so the user can answer with "yes".

---

## Stating Assumptions

Scope: Proceeding without an explicit answer

Rule: When proceeding on an assumption, list it where the user will see it,
before or together with the work, and name how to change it.

```
Assumptions:
- Deleting a session keeps its ledger entries (they are an audit trail)
- The endpoint returns 404 for an unknown session id, like the other handlers

Say if either should be different.
```
