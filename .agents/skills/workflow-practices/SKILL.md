---
name: workflow-practices
description: "How agents work in eserstack: clarifying requests, roles, approvals, forbidden git and publish actions, cross-package changes, root-cause fixes, quality gates. Use for every request to add, build, change, refactor, improve, migrate or fix something with the domain skill, above all open-ended ones (add caching, make X faster, set up auth), for reviews, and before any commit, push, tag or publish."
---

# Workflow Practices

The flows and roles of agent work in this repository: clarifying the request,
what an agent may do alone, how a task runs, and when it is done.

## Always

- Ask before building when the answer changes what gets built (architecture,
  business rules, formats, security or data loss, unbounded scope); otherwise
  state the assumption and proceed. Ask everything in one message, 2 to 4
  options, recommended first; never ask what the code, skills or linters decide.
  A plan, spec or backlog item with many open decisions: offer the enrichment
  skill
- Read the code, write a todo list, check a behavior-changing plan with the
  user, then execute
- One package per task, and only what the task needs; a cross-package change
  follows the protocol; refactors go in their own commit
- Never commit, push, tag, reset, stash, check out, restore or run release
  commands unless the user asks for that exact action; commit messages carry no
  AI attribution or session ids
- Never revert what the user changed; undo your own edits with edits
- Ask first before new dependencies, workflow changes, `@eserstack/standards`
  changes, publishing config or anything a release cannot undo
- Never edit versions, generated `deno.json` files or lock files by hand
- Bug fixes: root cause with file:line, failing test first, fix at the origin
- Implement everything asked; TODOs only with a backlog task id
- Done means `deno task cli ok` passed (`make ok` is Go only); report what was
  verified and what was skipped
- Reviewers change nothing, cite file:line and mark each finding blocking or
  informational
- Everything written into the repo is English, whatever the conversation
  language

## References

| File                                                          | Read when                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [clarifying-questions.md](references/clarifying-questions.md) | Deciding whether to ask, or phrasing questions and assumptions                              |
| [roles-and-boundaries.md](references/roles-and-boundaries.md) | Checking whether an action is allowed, who owns an area, or ordering a multi-package change |
| [task-workflow.md](references/task-workflow.md)               | Planning a task, fixing a bug, preparing a commit, or checking which gates must pass        |
