---
id: decision-64
title: Source of truth and sync for personal content
date: '2026-10-25 09:47'
status: accepted
---

## Context

The content comes from two kinds of places. Some of it the owner writes by hand (bio, CV, know-how, blog posts). Some of it already has a stream on a platform (YouTube videos, social posts, GitHub repositories, npm packages). Mirroring everything into the repository would swell it, and leaving everything on the platforms would leave the CV and the know-how without a home.

## Options

- Hybrid, by kind: hand-written content is canonical in the repository, platform streams are canonical on the platform and the repository holds an index
- The repository is canonical for everything and publishes out to the platforms
- The platforms are canonical and the repository only indexes

## Decision

Hybrid, by kind.

- Hand-written content is canonical here and is published out to the platforms where that makes sense.
- Platform streams stay on the platform. The repository keeps an index of them.
- Sources of the first sync: GitHub and npm/JSR, YouTube (RSS), X and Bluesky, blog RSS. LinkedIn has no open API, so it enters as hand-written records.
- Channels (X, Bluesky, YouTube, LinkedIn, GitHub) are complete `channel` records. Posts and videos are selective: all YouTube videos, and only the posts the owner picks. The feed is not mirrored.
- The owner picks a post with `eser content add <url>`, which reads public endpoints (Bluesky AT, YouTube RSS and oEmbed, X oEmbed). There is no paid X read API and no platform login in CI.
- GitHub and npm sync covers only what a `project` record names in `repo:` and `package:` (stars, last release, last commit, version). A new repository does not enter by itself; the owner adds it with `eser content add <url>`, which writes a `project` draft.
- `eser sync` runs by hand. A scheduled workflow runs it too, writes under `content/_synced/` and opens a pull request. Mechanical index records (title, date, URL) enter as `published`. A summary or comment written by an AI enters as `draft`.
- An AI proposes records as `status: draft`. The owner approves by setting `published`. An AI never publishes on its own.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q2, Q11, Q19, Q22, Q32 and Q36).

## Blocks

TASK-350, TASK-351 and TASK-353.
