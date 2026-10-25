---
id: decision-63
title: Make the repository Eser's digital self
date: '2026-10-25 09:47'
status: accepted
---

## Context

eserstack began as a personal software workshop: a foundation layer, developer tools and a product incubator. The owner's work is spread over blogs, videos, social channels, a CV, know-how, libraries and pet projects, and explaining it to people is hard because nothing holds it together. The owner wants one place that answers "who is Eser and what do they do", for people and for agents, with `npx eser intro` as the entry point.

## Options

- The repository becomes Eser's digital self, and the toolkit is one section of it
- The toolkit stays the product and the persona is a layer on top of the `eser` command
- Two identities (toolkit and persona) in one monorepo

## Decision

The repository becomes Eser's digital self (docs/adr/0010-eser-as-a-digital-interface.md, doc-4). laroux, noskills, the libraries and the pet projects are the "projects" part of it. The repository name `eser/stack` and the `@eserstack/*` package names stay. Libraries stay generic and reusable, and nothing personal goes into `pkg/@eserstack/*`.

Projects come in by kind:

- libraries that go to npm live in `pkg/@eserstack/`;
- applications and pet projects stay in their own repositories and have a project record here (slug, status, repository, package, domain, CLI).

The pivot is gradual. README.md, PHILOSOPHY.md and the package READMEs are not rewritten as part of this decision; they change in steps once the content layer exists (TASK-355).

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q1, Q7 and Q8).

## Blocks

The tasks of milestone m-9 (Track P).
