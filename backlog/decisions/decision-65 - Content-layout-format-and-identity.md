---
id: decision-65
title: Content layout, format and identity
date: '2026-10-25 09:47'
status: accepted
---

## Context

Every kind of content (bio, experience, project, approach, article, video, channel, profile) needs one shape that people, agents and validators can read, a stable identity so records can point at each other, and a way to see which records have gone stale.

## Options

- A top-level `content/` directory plus a typed loader package, one Markdown format
- Content inside a package's `data/` directory
- A separate repository as a submodule

## Decision

- Data lives in `content/` at the repository root. A typed package, `@eserstack/content` in `pkg/@eserstack/`, reads it. The owner chose the name on 2026-10-25 over `loader` (too narrow and already used for bundler and FFI loaders) and `me` (it would tie a generic library to one person).
- Records sit in a folder per year: `content/2026/20260301-laroux.md`. The folder year is the year in the slug, which never changes, and a validator checks they agree. Synced records go to `content/_synced/<year>/`. A translation is `<slug>.tr.md` beside the original. Browsing by kind is `eser content list --kind`, not a folder.
- Every record requires `kind`, `title`, `summary`, `lang`, `status`, `visibility` and `updated`. `shortcut`, `tags`, `refs` and `translation_of` are optional, and each kind adds its own fields (TASK-342). `summary` is required because `eser intro` and `llms.txt` describe a record in one or two sentences before anyone opens it.
- One format: a Markdown file with YAML frontmatter. Structured fields go in the frontmatter, prose goes in the body.
- `kind` is a small fixed set defined by the schema. `tags` are free. Records link to each other with `refs`, a list of slugs. A validator reports a broken `refs` entry.
- The CV is one `bio` record plus separate `experience` records (`start`, `end`, `org`, `role`, `refs`).
- Intro profiles (`--for coding-agent` and so on) are `kind: profile` records, so adding one needs no code change.
- Every record's slug carries a timestamp, for example `20261010-about`. The slug date is the creation date and never changes.
- A `shortcut` field maps a plain name (`about`, `laroux`) to the record. The loader builds a shortcut index and the CLI caches it. `refs` and `eser <name>` accept a shortcut or a full slug. A validator keeps shortcuts unique among published records and rejects a shortcut that equals a reserved command name.
- Records are edited in place. A `updated` field holds the last change. A precommit step writes it on changed content files, so it needs no git history.
- Staleness is measured from `updated`. The review interval is 6 months for `bio` and `project`, and 12 months for `experience`, `approach`, `channel` and `profile`. `article`, `video` and `social` record a moment in time and never go stale. A project with `status: archived` is not checked. `eser content stale` lists stale records and `eser intro` marks them `stale: true`. The gate does not fail on staleness, because time passing would break CI without any change.
- A draft stays in `content/` with `status: draft`. Snapshot, site, feed and `llms.txt` leave drafts out. `eser content review` lists them.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q12, Q14, Q23, Q29 to Q31, Q33, Q35, Q37, Q39 and Q40). The slug-with-timestamp and shortcut design is the owner's own.

## Blocks

TASK-342, TASK-344, TASK-345 and TASK-346.
