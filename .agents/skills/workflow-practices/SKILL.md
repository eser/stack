---
name: workflow-practices
description: "How agents work in this codebase: clarifying, roles, approvals, forbidden git, publish and destructive actions, parallel task agents, cross-package changes, root causes, gates. Use for every request to add, change, refactor, improve, migrate or fix something with the domain skill, above all open-ended ones (add caching, make X faster, set up auth), reviews, and any commit, push, tag or publish."
---

# Workflow Practices

The flows and roles of agent work in this codebase: clarifying the request, what
an agent may do alone, how a task runs, and when it is done. What differs
between codebases (the gate command, the high-impact areas, whether agents
commit) comes from this codebase's AGENTS.md.

## Always

- Ask before building when the answer changes what gets built (architecture,
  business rules, formats, security or data loss, unbounded scope); otherwise
  state the assumption and proceed. Ask everything in one message, 2 to 4
  options, recommended first; never ask what the code, skills or linters decide.
  A plan, spec or backlog item with many open decisions: offer the enrichment
  skill
- Read the code first, and check a behavior-changing plan with the user before
  executing it
- One package per task, and only what the task needs; a cross-package change
  follows the protocol; refactors go in their own commit
- Never commit, push, tag, reset, stash, check out, restore or run release
  commands unless the user asks for that exact action, or AGENTS.md delegates
  task commits to agents (task-workflow.md: Parallel Task Agents). Push, tag and
  release stay the user's call: never suggest or offer them
- Commits use the configured git identity and one or two lines,
  `type(scope): outcome`, with no body, agent name, session id or trailer
- Never revert what the user changed; undo your own edits with edits
- Ask first before new dependencies, workflow changes, changes to shared
  foundation packages, publishing config or anything a release cannot undo
- Never edit versions, generated files (such as a generated `deno.json`) or lock
  files by hand
- Bug fixes: root cause with file:line (in the notes or report, not the commit),
  failing test first, fix at the origin
- Implement everything asked; TODOs only with a backlog task id
- Done means the full gate named in AGENTS.md passed, not a narrower command;
  report what was verified and what was skipped
- Reviewers change nothing, cite file:line and mark each finding blocking or
  informational
- Everything written into this codebase is English, whatever the conversation
  language

## References

| File                                                          | Read when                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [clarifying-questions.md](references/clarifying-questions.md) | Deciding whether to ask, or phrasing questions and assumptions                                                       |
| [roles-and-boundaries.md](references/roles-and-boundaries.md) | Checking whether an action is allowed, who owns an area, or ordering a multi-package change                          |
| [task-workflow.md](references/task-workflow.md)               | Planning a task, fixing a bug, writing a commit, working as a parallel task agent, or checking which gates must pass |
