---
id: doc-4
title: 'Eser as a digital interface: vision and content model'
type: specification
created_date: '2026-10-25 09:55'
---

# Eser as a digital interface: vision and content model

Source: the enrichment session of 2026-10-25. The decisions are decision-63 to decision-69 and docs/adr/0010-eser-as-a-digital-interface.md. This document describes what the owner wants and how the pieces fit. The ADR holds the rationale and the rejected options.

## The problem

The owner's work is spread over blogs, videos, social channels, a CV, know-how, libraries and pet projects. Explaining it to a person takes many conversations and still comes out scattered. An agent that is told "I am Eser" has nothing to read.

## The goal

One place that answers "who is Eser, what do they work on, how do they think". A reader can stop at a few lines or dig as deep as they like, and the owner adds work in one place instead of seven.

```bash
npx eser intro                 # who, and which categories exist
npx eser intro experience      # one category in depth
npx eser intro --for coding-agent
npx eser laroux dev            # a project with a CLI is forwarded to it
npx eser petproject            # a project without one prints its card
```

Websites follow the same content: `eser.dev` for the person and `<project>.eser.dev` for each project.

## Who reads it

| Reader                     | What they need                                           | Surface                      |
| -------------------------- | -------------------------------------------------------- | ---------------------------- |
| A coding agent             | How Eser writes code, which rules and tools they use     | `eser intro --for coding-agent` |
| A person writing about Eser | Biography, experience, projects, public writing          | `eser intro --for biographer` |
| A recruiter or collaborator | CV, projects with their status, how to get in touch      | `eser intro --for recruiter`  |
| Anyone browsing            | A readable site generated from the same records          | `eser.dev`, `llms.txt`       |

The profiles are records, so the owner adds or edits one without a code change.

## What goes in

| `kind`       | Holds                                                      | Origin                                  |
| ------------ | ---------------------------------------------------------- | --------------------------------------- |
| `bio`        | Who Eser is, in the owner's words                          | Hand-written                            |
| `experience` | A job, a role or a degree, with dates                      | Hand-written                            |
| `project`    | A library or pet project: status, repository, package, domain, CLI | Hand-written, facts synced from GitHub and npm |
| `approach`   | How Eser builds software: rules, directives, know-how      | Hand-written (`@eserstack/directives` joins here) |
| `article`    | A blog post                                                | Hand-written or indexed from RSS        |
| `video`      | A YouTube video                                            | Indexed from YouTube RSS                |
| `social`     | A post the owner picked                                    | Added with `eser content add <url>`     |
| `channel`    | An account or channel: X, Bluesky, YouTube, LinkedIn, GitHub | Hand-written                          |
| `profile`    | A reading profile for `eser intro --for`                   | Hand-written                            |

The set is fixed by the schema (TASK-342). New kinds need a schema change, not a new folder.

## A record

```markdown
---
kind: project
shortcut: laroux
lang: en
status: published
visibility: public
title: laroux
summary: A React framework on rolldown with server functions and islands.
updated: 2026-10-25
repo: https://github.com/eser/stack
package: "@eserstack/laroux"
domain: laroux.eser.dev
cli: laroux
site: external
refs: [20261010-about]
tags: [react, framework]
---

Why it exists, what it does, where it stands.
```

The file is `content/2026/20260301-laroux.md`, in the folder of the year in its slug. The date in the slug is the day the record was created and never changes. The shortcut `laroux` points to it. Edits happen in place and `updated` records the last one.

## Flows

Adding by hand: write the file, run the gate. A precommit step writes `updated`. The validators check the schema, `refs`, shortcut uniqueness, reserved command names and sensitive data.

Adding with an AI: the owner talks or drops a note, the AI proposes a record with `status: draft`, `eser content review` lists it, the owner edits and sets `published`. Drafts never reach the snapshot, the site or `llms.txt`.

Syncing: `eser sync` or a scheduled workflow reads GitHub, npm, YouTube and blog RSS, writes under `content/_synced/` and opens a pull request. Mechanical records are `published`. Anything an AI wrote is a `draft`.

Reading: the npm package carries a snapshot that works offline. The CLI refreshes it from eser.dev into a local cache when the network is there.

Staleness: each kind has a review interval. `eser content stale` lists records past it. The gate does not fail on it.

## Boundaries

- The repository is public. Nothing sensitive goes in it, and `private` is not a valid visibility here. The private layer is a separate repository and a separate decision (TASK-356).
- Libraries under `pkg/@eserstack/` stay generic. The content layer is a consumer, never a dependency of foundation packages.
- No persona code is written until every task of m-0 to m-8 is Done (decision-69). Until then only documents and backlog items move, and README.md and PHILOSOPHY.md are not rewritten.
- `content/` is exempt from the English-only rule once TASK-348 lands. Each record states its `lang`.

## Not decided yet

- The kind-specific frontmatter fields (TASK-342). The shared fields, the folder layout and the review intervals are settled in decision-65.
- The CI token the sync uses.
- Which scattered repositories and sources go in, within the seed order approaches, projects, bio and experience, then articles and videos (TASK-343).
- The private layer's local path, first kind and agent access rules (TASK-356). Its direction is settled in decision-66.
