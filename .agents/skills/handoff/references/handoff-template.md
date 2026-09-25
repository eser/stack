# Handoff Template

The sections of a handoff document and what goes in each. A fresh agent reads it
once, before anything else, so it states facts and pointers, not narrative.

## Contents

- Sections
- Size and Style
- Before Saving

---

## Sections

Scope: Every handoff document

Rule: Use these sections in this order, and omit any that would be empty.

```markdown
# Handoff: <topic> (<YYYY-MM-DD HH:MM>)

## Next Focus

What the next session is for (the /handoff argument, or the natural next step).

## Where Things Stand

- Done and verified: <change>: <how it was verified: command, test, output>
- Done, not verified: <change>: <what still needs checking>
- In progress: <what, and where it stopped>

## Decisions and Constraints

- <decision or constraint the user gave>: <reason, if given>

## Open Questions

- <question still waiting for the user, with the options discussed>

## Next Steps

1. <first concrete step>
2. ...

## References

- Changed files (uncommitted): <paths, from git status>
- Artifacts: <spec, ADR, backlog task ids, PR or commit ids, URLs>

## Pitfalls

- <approach that failed or trap found, and why, so it is not retried>

## Suggested Skills

- <skill>: <why the next task needs it>
```

- **Decisions and Constraints** holds only what the session settled and no file
  records yet. A rule already in `AGENTS.md`, a skill or the agent's memory is
  not repeated.
- **Pitfalls** saves the next agent from repeating a dead end: a command that
  hung, an API that does not exist, a check that flags generated files.
- **Suggested Skills** names skills from `.agents/skills/` by name, based on the
  next focus (for example workflow-practices and go-practices for continuing a
  Go change).

---

## Size and Style

Scope: The whole document

Rule: Aim for one to two screens. A reader who needs more follows the
references. Write in short bullets with paths and ids, in the plain style of
documentation-conventions: Plain Prose. Quote an error message or a command
exactly when it matters; do not paste diffs, logs or file contents that the
references already reach.

---

## Before Saving

Scope: The last step

Rule: Check the draft once more:

- no secret, token, key, password, email or person's name is left in it;
- every "verified" line names its evidence;
- every path and id exists (`git status`, the backlog, the PR list);
- the next focus from the argument is what the document is centred on.

Then write the file and reply with its path and a one-line summary.
