# Make the repository Eser's digital self

## Status

Accepted. The owner chose the direction and each choice below on 2026-10-25 in
an enrichment session. The record of each answer is decision-63 to decision-69;
the vision and the content model are in backlog doc-4. The number leaves 0007 to
0009 free for the laroux R1 ADRs that TASK-289 reserves.

## Context and Problem Statement

eserstack began as a personal software workshop: a foundation layer, developer
tools and a product incubator. The owner's work is wider than the code. It is
also blog posts, videos, social channels, a CV, know-how and pet projects, kept
in many repositories and platforms (`~/projects/eser/` holds dozens). The owner
finds it hard to explain all of it to people in one conversation, and an agent
that is told "I am Eser" has nothing to read.

The owner wants the repository to be the one entry point to everything they
make, for people and for agents. A person or an agent runs `npx eser intro` and
learns which categories exist, then goes as deep as they want. Each project is
reachable as `<project>.eser.dev`, as `@eserstack/<project>` on npm and as
`npx eser <project>`.

The questions are what the repository is, where the content lives and who owns
it, how readers reach it, and when the work starts, given that milestones m-0 to
m-8 are still moving the repository off Deno.

## Decision Drivers

- One place to add work and one place to read it, to cut the scatter.
- The `eser` command stays what installed hooks expect (decision-10).
- The repository is public, so nothing sensitive can be committed.
- Content changes more often than releases.
- The repository follows the philosophy "tools that think but don't decide", so
  an AI proposes and the owner approves.
- The pivot is gradual. No rewrite of README.md or PHILOSOPHY.md.

## Considered Options

- **Digital self.** The repository is Eser. The toolkit, the libraries and the
  pet projects are its projects section.
- **Toolkit with a persona layer.** eserstack stays a toolkit and `eser` gets an
  extra layer.
- **Two identities in one monorepo.** Separate branding for the toolkit and the
  persona.

## Decision Outcome

Chosen option: the repository is Eser's digital self (decision-63). The
sections below summarize the other decisions.

### Content layer

- Data lives in `content/` at the root, read by the typed package
  `@eserstack/content` in `pkg/@eserstack/`. The package holds the schema, the
  loader, the shortcut index and the snapshot builder. It is generic, with no
  personal data in it.
- One format: Markdown with YAML frontmatter (decision-65).
- A fixed `kind` set (`bio`, `experience`, `project`, `approach`, `article`,
  `video`, `social`, `channel`, `profile`), free `tags`, `refs` by slug.
- Every record has a timestamped slug (`20261010-about`) and an optional
  `shortcut` (`about`). The loader builds a shortcut index and the CLI caches
  it. Records are edited in place and carry `updated`, which a precommit step
  writes.
- Records sit in a folder per year (`content/2026/20260301-laroux.md`). Every
  record requires `kind`, `title`, `summary`, `lang`, `status`, `visibility` and
  `updated`.
- Review intervals drive `eser content stale`: 6 months for `bio` and `project`,
  12 months for `experience`, `approach`, `channel` and `profile`, none for
  `article`, `video` and `social`. The gate does not fail
  on staleness.

### Source of truth

Hybrid, by kind (decision-64). The owner's hand-written content is canonical in
the repository. Platform streams stay on the platform and enter as an index,
through `eser sync` and a scheduled workflow that opens a pull request. The
owner picks social posts with `eser content add <url>`. An AI writes drafts
(`status: draft`), never `published`.

### Visibility, language and sensitive data

- `visibility` is `public` or `unlisted`. `private` is invalid here, and a
  validator rejects sensitive patterns (decision-66).
- `content/` is exempt from the English-only rule, with a required `lang`. The
  exemption starts with TASK-348.
- The private layer is a separate private repository with the same schema and
  CLI, bound from a local path and ignored when absent. TASK-356 settles the
  path, the first private kind and the agent's access rules.

### Command surface

Developer commands keep their top-level names. The persona adds `eser intro`,
`eser <project>`, `eser content` and `eser sync` (decision-67). `eser <name>`
forwards to the project's CLI when the record has `cli:`, and prints a card
otherwise. A reserved-name validator keeps shortcuts from shadowing commands.

### Delivery, hosting and discovery

The npm package carries a snapshot and the CLI refreshes it from eser.dev into a
local cache (decision-68). The site runs on Cloudflare Workers with laroux R1.
A wildcard Worker renders a default landing for `<project>.eser.dev`, and a
record with `site: external` hands the subdomain to the project's own site.
Agents find the content through `llms.txt`, a JSON feed and one AGENTS.md line.

### Timing

No persona code is written until every task of m-0 to m-8 is Done
(decision-69). The persona commands are written once, in Go, against the `eser`
binary of m-3. Documents and backlog items move now.

## Consequences

- AGENTS.md gets a short Direction note, and its English-only rule gets an
  exemption for `content/` when TASK-348 lands.
- New validators join the precommit workflow: schema, `refs`, shortcut
  uniqueness, reserved names, sensitive patterns, and the `updated` writer.
- `pkg/@eserstack/directives` and PHILOSOPHY.md become sources for `approach`
  records; nothing in them is rewritten for this ADR.
- The release stays the owner's call. Content changes reach readers through the
  live refresh, so they need no release.
- The scheduled sync workflow, the wildcard Worker and the DNS records are
  workflow and infrastructure changes. Each one needs the owner's approval
  before it starts (workflow-practices).
- The risks are the dependency on laroux R1's Workers target for hosting, the
  size of the m-0 to m-8 wait, and the upkeep of the synced adapters when a
  platform changes its public endpoints.

## Links

- Decisions: decision-63, decision-64, decision-65, decision-66, decision-67,
  decision-68, decision-69
- Vision and content model: backlog doc-4
- Milestone: m-9 (Track P)
- Related: ADR 0005 (leave Deno for Node and Go), decision-10 (existing noskills
  hooks), decision-28 (posts in Go or as a Node plugin)
