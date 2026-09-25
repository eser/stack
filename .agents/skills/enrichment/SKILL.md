---
name: enrichment
description: Interviews the user about a plan, decision or idea in rounds, level by level down a decision tree, until both share one understanding; facts are researched by sub-agents, decisions stay with the user. Use when the user asks to enrich, grill or stress-test a plan, and offer it when drafting a PRD, spec, ADR or backlog item whose content has open decisions. Not for a one-off comparison.
---

# Enrichment

A deliberate interview about a plan, decision or idea that continues until no
decision is left open; nothing is built during it. It starts in two ways: the
user asks for it, or the agent offers it while drafting a plan (a PRD, spec, ADR
or backlog item) whose content has open decisions. The short clarification
before a normal task stays in workflow-practices: Ask, Assume or Proceed.

## Always

- When drafting a plan with more open decisions than one round of clarification
  settles, offer an enrichment session instead of guessing; start it only when
  the user accepts
- Model the topic as a design tree: each decision branches into the decisions
  that depend on it, level by level from goals down to details
- When a level of the tree is settled, stop and ask whether to go into the next
  level of detail or finish at this depth
- Each round asks the whole frontier, every open decision whose prerequisites
  are settled, numbered, each with a recommended answer and its reason
- Never ask a question whose answer depends on another question still open in
  the same round; it waits for a later round
- Facts are the agent's job: look up anything the repository, tools or docs can
  answer, with sub-agents in parallel, and never ask the user for it
- A pending lookup blocks only the questions downstream of it; ask the rest of
  the frontier now
- Decisions are the user's: put each one to them, and wait for the answers
  before the next round
- The session ends when the frontier is empty, or when the user stops or
  declines the next level; then summarize the settled tree, list what is still
  open, and write the result into the artifact being drafted
- Do not act on the outcome until the user confirms the summary

## References

| File                                                  | Read when                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| [interview-rounds.md](references/interview-rounds.md) | Running a session: starting it, levels, rounds, facts, ending it |
