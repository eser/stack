---
name: handoff
description: Writes a handoff document that lets a fresh agent session continue the current work, saved outside the repository. Takes an optional note on what the next session will focus on.
argument-hint: "[what the next session will work on]"
disable-model-invocation: true
---

# Handoff

Compacts the current conversation into one document a fresh agent can start
from. The user starts it with `/handoff`; the argument, if any, is the focus of
the next session: $ARGUMENTS

## Always

- Write the document to the OS temporary directory (`$TMPDIR`, else `/tmp`) as
  `handoff-<repo>-<YYYYMMDD-HHMM>.md`, never into the repository, and give the
  user its full path
- Follow the section template in handoff-template.md; English, whatever the
  conversation language
- Tailor it to the argument: keep what the next focus needs, drop what it does
  not. Without an argument, cover the whole session
- Point to artifacts instead of copying them: specs, plans, ADRs, backlog task
  ids, commits, PRs and changed files by path, id or URL
- Separate what was verified (with the command or evidence) from what was only
  changed or assumed; never present an unverified step as done
- Record the user's decisions and constraints from this session that no file
  holds yet, with the reason when one was given
- Name the uncommitted changes, so the next agent works with them and does not
  revert them (workflow-practices: Never Revert User Changes)
- Include "Suggested skills": which skills the next agent should load first, and
  why
- Redact secrets and personal data: no keys, tokens, passwords, emails or names;
  refer to people by role
- Do not commit, push or open the file; stop after reporting the path

## References

| File                                                  | Read when                            |
| ----------------------------------------------------- | ------------------------------------ |
| [handoff-template.md](references/handoff-template.md) | Writing the document: sections, size |
