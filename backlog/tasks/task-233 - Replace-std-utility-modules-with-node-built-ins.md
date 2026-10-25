---
id: TASK-233
title: Replace @std utility modules with node built-ins
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - dependencies
  - std
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace each @std utility with a built-in:
- @std/cli/parse-args (23 files) becomes node:util parseArgs. Check flag semantics at each call site.
- @std/path, to-file-url and glob-to-regexp become node:path, node:url and path.matchesGlob.
- @std/fs becomes node:fs/promises (cp, mkdir).
- @std/encoding hex and base64 become Uint8Array.toHex and Buffer.
- @std/dotenv becomes util.parseEnv.
- @std/media-types becomes a small typed MIME table in laroux-server.
Remove the matching npm:@jsr aliases. One commit per package, with lockfile changes made by the integration agent.

Decisions this task waits on: decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-30 (Replacements for the JSR-hosted runtime dependencies).

Plan key: M2-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No import of @std/cli, @std/path, @std/fs, @std/encoding, @std/dotenv or @std/media-types remains
- [ ] #2 Tests cover CLI flag behavior for each command that used parse-args
- [ ] #3 The gate is green
<!-- AC:END -->
