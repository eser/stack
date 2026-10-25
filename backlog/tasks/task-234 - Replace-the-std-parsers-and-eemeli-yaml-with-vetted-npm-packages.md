---
id: TASK-234
title: Replace the @std parsers and @eemeli/yaml with vetted npm packages
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - dependencies
  - std
  - formats
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision std-deps, swap @std/toml, @std/jsonc, @std/csv, @std/semver, @std/ulid, @std/tar and the @eemeli/yaml alias for vetted npm packages (for example yaml, smol-toml, jsonc-parser, semver), or for crypto.randomUUID where a ULID is not required. Each dependency gets a vetting note under tooling-standards, and the integration agent lands the lockfile changes.

Decisions this task waits on: decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-30 (Replacements for the JSR-hosted runtime dependencies).

Plan key: M2-T3. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No @std/* or @jsr/* runtime dependency remains in any package.json apart from test-kit's @std/assert and @std/testing, which M2-T4 removes
- [ ] #2 The formats round-trip tests and other affected tests pass
- [ ] #3 Each new dependency has a vetting note in the task
<!-- AC:END -->
