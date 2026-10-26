---
id: TASK-120
title: Resolve the MuxServer private-type-ref in noskills-web
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-web
  - docs
dependencies: []
references:
  - pkg/@eserstack/noskills-web/terminal/mux-host.ts
priority: low
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno doc --lint pkg/@eserstack/noskills-web/mod.ts` reports that the public field MuxHost.server (terminal/mux-host.ts:47) references the private type MuxServer from @eserstack/mux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MuxServer is re-exported from mod.ts or the field is hidden behind methods
- [x] #2 deno doc --lint pkg/@eserstack/noskills-web/mod.ts reports no errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Verified:
- MuxHost.server is now the private #server, behind attachSocket(socket), which wraps the socket with mux.engine.sanitizeRemoteTransport.
- mux's disconnect only clears the current sink, so when an old socket closes after a new one attached, the new one stays connected. mux-host.test.ts covers this.
- `deno doc --lint pkg/@eserstack/noskills-web/mod.ts` reports no errors.
<!-- SECTION:NOTES:END -->
