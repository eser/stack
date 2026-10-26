---
id: decision-68
title: Delivery, hosting and agent discovery of the persona
date: '2026-10-25 09:47'
status: accepted
---

## Context

Content changes often and a release is the owner's call, so `npx eser intro` cannot depend on a release for every new post. People and agents also need to find the content without running the CLI.

## Options

- A snapshot in the npm package plus a live refresh into a local cache
- Snapshot only
- Live only

## Decision

- Delivery: the npm package carries a snapshot from release time and works offline. When the network is available the CLI fetches the current snapshot from eser.dev, falls back to a GitHub raw URL until the site exists, and writes a local cache. New content does not need a release.
- Hosting: Cloudflare Workers, on laroux R1's Workers target (m-7). The Node plus ArgoCD route is the recorded alternative if that target does not hold.
- The site: `eser.dev` is generated from `content/` (personal pages, project index, `llms.txt`, a JSON feed).
- Project landings: a wildcard Worker on `*.eser.dev` renders a default landing from the project record. The default landing shows the record's title and summary, a status badge, links to the repository, package and `refs` articles and videos, the install command (`npx eser <name>` when the record has `cli:` or `package:`), and the Markdown body. A record with `site: external` hands that subdomain to the project's own site and DNS. A validator checks that the record and the DNS agree.
- Agent discovery: `llms.txt` and the JSON feed on `eser.dev`, and one `AGENTS.md` line that tells an agent to run `npx eser intro` when a user says they are Eser. There is no generated skill and no MCP server in the first version.

## Decided by

The owner chose this on 2026-10-25 in an enrichment session (Q8, Q13, Q18, Q24, Q25, Q28 and Q34).

## Blocks

TASK-349 and TASK-352.
