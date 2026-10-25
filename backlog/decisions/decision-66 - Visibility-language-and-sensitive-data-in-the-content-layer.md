---
id: decision-66
title: Visibility, language and sensitive data in the content layer
date: '2026-10-25 09:47'
status: accepted
---

## Context

The repository is public, so nothing committed to it can be hidden, and git history keeps what a later commit removes. The content includes Turkish text, while AGENTS.md says everything in the codebase is English. The owner also wants a private side for a "Jarvis" use later.

## Options

- Public only in this repository, with a `visibility` field in the model from the start and the private layer in a separate private repository later
- Public only, no `visibility` field
- Private records in this repository, encrypted

## Decision

- Every record has a `visibility` of `public` or `unlisted`. `private` is not a valid value in this repository. A validator rejects it, and rejects telephone numbers, street addresses and personal email addresses.
- `unlisted` means the file is open and reachable by its slug or URL, but `eser intro`, the site, the feed and `llms.txt` do not list it. It is for unfinished or archived work, never for sensitive data.
- The private layer (personal notes, calendar, to-dos) is a separate private repository that uses the same `@eserstack/content` schema and the same `eser` CLI, where `private` is a valid visibility. `eser` binds it from a local path (for example `~/.config/eser/private`) and ignores it when the path is absent. An agent on the owner's machine reads it as local files, not over the network. The path, the first private kind and the agent's access rules are settled in TASK-356.
- `content/` is exempt from the English-only rule in AGENTS.md. Every record carries a required `lang` field. Code, ADRs, backlog items, documentation and commit messages stay English. The exemption takes effect when `content/` is introduced (TASK-348), not before.
- `eser intro` answers in English by default. A translation is a separate file in the other language with `translation_of: <slug>`. `eser intro --lang tr` returns the Turkish record when it exists and the English one when it does not.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q3, Q4, Q26, Q27 and Q38).

## Blocks

TASK-345 and TASK-348. Amends the language rule in AGENTS.md once TASK-348 lands.
