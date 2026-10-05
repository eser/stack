---
id: TASK-148
title: Bring the pkg/ajan Go READMEs up to the README rules and add one for i18nfx
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ajan
  - docs
dependencies: []
references:
  - pkg/ajan/httpfx/README.md
  - pkg/ajan/logfx/README.md
  - pkg/ajan/processfx/README.md
  - pkg/ajan/i18nfx
priority: low
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pkg/ajan Go package READMEs (httpfx, logfx, processfx, configfx, connfx and the others) have no emoji title, no Links footer and no Quick Start; processfx is titled 'ProcessFX'. The stale httpfx NewHTTPService and Example Usage sections were already fixed. pkg/ajan/i18nfx has no README: it should cover Config (default_locale, locales_dir), the <lang>.toml message files go-i18n reads, the fallback order of T and TWithData, script-based IsRTL and Dir, and TemplateFuncMap. TASK-51 covers the TypeScript package READMEs only. Rule: documentation-conventions: Package README Structure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each existing pkg/ajan README has the title, Quick Start and Links footer readmes.md requires, and its examples run as pasted
- [x] #2 pkg/ajan/i18nfx/README.md exists and follows readmes.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

final: I checked all ten pkg/ajan READMEs: configfx, connfx, httpclient, httpfx, i18nfx (new), lib, logfx, processfx, results and types.
- **Structure:** each has an emoji title, the import-path header, a Quick Start and a 🔗 Links footer.
- **Quick Starts:** I extracted each one and ran go vet, gofmt and the program itself. The output matches the README for results, types, lib, logfx, configfx (including the `server__port=9090` override), processfx (SIGINT shutdown log), httpclient (`200 ok`, `attempts: 3`), connfx (`answer: 42` plus the health line), httpfx (curl returns OK with security headers) and i18nfx (all six lines).
- **i18nfx claims:** I probed them separately: T with placeholders gives `<no value>`, tr-TR falls back to tr.toml, an empty or unparsable locale falls back to the default, IsRTL handles az-Arab and az, the TemplateFuncMap output matches, and the missing-directory error is as documented.
- **Identifiers:** every `pkg.Identifier` the READMEs name exists in go doc.
- **Fixed:** I put back the two emoji bullets that had been removed (connfx 🔧 Bridge pattern, logfx ⚡ Standard library base), worded so they match the code.
<!-- SECTION:NOTES:END -->
