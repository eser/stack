---
id: TASK-303
title: 'laroux: i18n routing'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-293
priority: medium
ordinal: 303000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 13 (decision-54). The i18n config; locale prefix stripping in the matcher with prefixDefaultLocale and redirectToDefaultLocale; detection from the cookie and Accept-Language on locale-less paths only, never for bots, with 307, Vary and private caching; domains, which also join allowedOrigins; `locale()`, `locales()`, `localizedPath()` and `alternateLinks()` in `/rsc/server`, `useLocale()` and `<Link locale>` on the client; staticParams multiplied by locales; the locale in islandContext; the `i18n()` handler step. Proxy chains and route binding see the path without the prefix.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4k. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Matcher tests cover every routing option combination, including custom locale paths
- [ ] #2 Tests show detection redirects only on locale-less paths, never for a crawler user agent, with the documented headers
- [ ] #3 A test prerenders a route for every locale, and alternateLinks returns one link per locale
- [ ] #4 A test shows one proxy.ts covers `/about` and `/tr/about`
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
