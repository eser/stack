---
id: TASK-27
title: Validate the registry URL used by noskills pack
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - security
  - noskills
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/pack.ts
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/noskills/commands/pack.ts:908-921 fetches registryUrl read from the repository's .eser/manifest.yml without any scheme or host check. Running noskills pack search in an untrusted checkout makes the process request any URL the repo author chose, including cloud metadata and internal services. Rule: security-practices: Outbound Requests to User-Supplied URLs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The registry URL must be https, or http only for loopback, as posts/config.ts requireServiceUrl does
- [x] #2 Private and link-local addresses are refused at connect time or the reason for allowing them is documented
- [x] #3 Tests cover rejected and accepted URLs
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

noskills: parseRegistryUrl requires https, or http for loopback only. It refuses credentials and internal IP literals, and fetchRegistry refuses redirects and caps the body size. The 43 tests in registry.test.ts pass. The verifier corrected README-HOW, which named only 127.0.0.1 although all of 127/8 is allowed, and added the missing JSDoc on PackRegistryError.
<!-- SECTION:NOTES:END -->
