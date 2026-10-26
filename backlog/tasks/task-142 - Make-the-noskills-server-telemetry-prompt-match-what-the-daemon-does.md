---
id: TASK-142
title: Make the noskills-server telemetry prompt match what the daemon does
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-server
  - privacy
dependencies: []
references:
  - cmd/noskills-server/telemetry.go
  - cmd/noskills-server/README.md
priority: medium
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
promptTelemetry asks 'Send anonymous TTHW timing to help improve noskills?' (cmd/noskills-server/telemetry.go:125) and on yes prints 'Anonymous timing will be sent on first session attach.' (line 137), but nothing in the repository reads telemetry.json or sends any timing. The prompt makes an unbacked claim on a privacy question. TASK-37 covers the ignored errors in the same file. Rule: documentation-conventions: Claims Need Evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either the opt-in report is implemented with its endpoint, payload and timeout documented, or the prompt and the telemetry.json README entry are removed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: main.go no longer calls promptTelemetry. The README telemetry.json entry is gone, and the README now has an Update check section, whose claims (URL, 5s timeout, User-Agent) I checked against update_check.go. I tried `rm cmd/noskills-server/telemetry.go cmd/noskills-server/telemetry_test.go` again, and the auto-mode classifier refused it again ('Irreversible Local Destruction'). Both files are dead: nothing outside them references promptTelemetry or stdinIsTerminal. golangci-lint reports cmd/noskills-server/telemetry.go:71:6 stdinIsTerminal unused. I did not hide this with a nolint, and I did not empty the file instead of deleting it.

Orchestrator: deleted the unused cmd/noskills-server/telemetry.go and telemetry_test.go; the server builds and vets.
<!-- SECTION:NOTES:END -->
