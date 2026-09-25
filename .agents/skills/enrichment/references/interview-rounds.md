# Interview Rounds

How an enrichment session runs, round by round.

## Contents

- Starting a Session
- The Design Tree
- Levels and Checkpoints
- The Frontier
- Round Format
- Facts and Sub-Agents
- Processing Answers
- Ending the Session

---

## Starting a Session

Scope: When an enrichment session begins

Rule: A session starts in one of two ways.

- **The user asks** ("enrich this", "grill me on the plan"): start with the
  first round.
- **The agent offers it** while drafting a plan: a PRD, a spec, an ADR, the
  content of a backlog item, or any other artifact whose content decides what
  gets built. Offer it when the draft has more open decisions than one round of
  clarification settles, or when a guess would change the scope. Say how many
  decisions are open and which area they are in, and ask whether to run a
  session; if the user declines, list the open decisions as explicit assumptions
  in the draft (workflow-practices: Stating Assumptions).

Correct:

```
The spec for the notification system has about eight open decisions (delivery
channels, retry policy, storage, user preferences). Shall I run an enrichment
session before writing it, or draft it now with those as stated assumptions?
```

---

## The Design Tree

Scope: The start of a session

Rule: Before the first round, sketch the decisions the topic contains and how
they depend on each other: a storage decision depends on the data model, a
migration plan on the storage decision. Keep the tree in your working notes, not
in the reply; the user sees it only as rounds and, at the end, as the summary.
Leave out what the repository, the skills or the linters already decide; those
are facts, not decisions.

**Why:** asking in dependency order is what keeps a round answerable without
guessing, and the tree is what shows when a branch is still unvisited.

---

## Levels and Checkpoints

Scope: Moving from one depth of the tree to the next

Rule: Work the tree level by level: first the goals and scope, then the
approach, then the details of each part. When every decision of the current
level is settled, pause before going deeper: give a short summary of the level,
say which areas the next level would cover and roughly how many questions it
holds, and ask whether to continue into the details or stop at this depth.

```
Level 1 is settled: scope, channels (email and in-app) and storage (SQLite).
Level 2 would cover retry and backoff, the preference model and the delivery
API, around nine questions. Go into the details, or stop here and write the
spec at this depth?
```

A plan that is only needed at the level of scope stops here, and the remaining
levels become open items in the artifact. A user who wants the full picture
continues.

**Why:** the right depth differs per plan; asking at each level keeps a backlog
item from turning into a design document, and a design from stopping before its
details.

---

## The Frontier

Scope: Choosing the questions of a round

Rule: The frontier is every open decision of the current level whose
prerequisites are all settled. Ask all of it in one round, most consequential
first. A decision that depends on an answer you have not heard yet is not on the
frontier, even when it seems likely; asking it now forces the user to answer a
hypothetical.

---

## Round Format

Scope: Every round

Rule: Number questions across the whole session (the second round continues at
Q5, not Q1), so an answer like "Q6: B" stays unambiguous. Each question has a
short title, the context the user needs, the options when there are discrete
ones, and your recommended answer with its reason. Use this text format rather
than a question tool, which limits how many questions and how much context fit.

```
❓ **Q1** - **Storage for session history**: Sessions are currently kept in
memory and lost on restart. Options:
A. SQLite file next to the daemon state
B. PostgreSQL through connfx's pgx adapter
C. Keep in memory, add an export command

➡️ A: the daemon runs on developer machines where PostgreSQL is not a given,
and a pure-Go SQLite driver (`modernc.org/sqlite`) is already in `go.mod`
(used by connfx tests), so no cgo or new dependency is needed.

---

❓ **Q2** - **Retention**: ...

➡️ ...
```

Write questions in the conversation's language. Anything written into the
repository afterwards is English (workflow-practices: Language).

---

## Facts and Sub-Agents

Scope: Questions that need information from the environment

Rule: When a frontier question needs a fact (what the code does today, which
dependency is already present, what a tool supports), look it up instead of
asking. For a lookup that takes more than a quick search, dispatch a sub-agent
and keep going: ask the frontier questions that do not depend on it now, and the
dependent ones in the round after the result arrives. Report the facts you found
in the round where they matter, with file:line, so the user decides on the same
information you have.

**Why:** a user asked for something the code already answers loses time and may
answer wrong; a round held back for one lookup stalls every independent
decision.

---

## Processing Answers

Scope: Between rounds

Rule:

- Mark each answered decision settled and recompute the frontier: settled
  decisions unblock the ones that depended on them.
- "Your recommendation" or "ok" settles a question with the recommended answer.
- An unclear or partial answer stays open and comes back, rephrased, in the next
  round.
- An answer that contradicts an earlier decision reopens that branch: say which
  earlier answer it conflicts with and ask which one holds.
- A new idea from the user adds a branch to the tree.

---

## Ending the Session

Scope: When the frontier is empty, or the user stops or declines the next level

Rule: The session is complete when every branch of the chosen depth has been
visited and nothing is silently assumed. Then give a summary of the settled
tree: each decision and its answer, grouped by branch, followed by what is still
open. If the user stops early, the open decisions become explicit assumptions in
that summary. Ask the user to confirm it. After they do, write the result into
the artifact the session was for (the PRD, spec, ADR or backlog item), with the
open items listed in it; any code change after that follows the normal task
workflow (workflow-practices).
