---
id: TASK-52
title: Choose one canonical CONTRIBUTING.md
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 13:27'
labels:
  - docs
dependencies: []
references:
  - CONTRIBUTING.md
  - .github/CONTRIBUTING.md
priority: medium
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The root CONTRIBUTING.md has the real setup (Go toolchain, deno task cli ok, docs, ADRs, commit style) and is the one README.md and cmd/noskills-server/README.md link to. .github/CONTRIBUTING.md is generic and stale ("just familiarity with JavaScript", "Deno Formatter and Linter should be fine for now"), yet GitHub prefers .github/ over the root, so the contributing link on new issues and pull requests shows the stale file. Only its code of conduct pointer (@eserstack/directives) and pull request steps are not in the root file. Rule: documentation-conventions: Contributor Setup Stays Documented.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One file holds the setup; the other is removed or points to it
- [x] #2 The code of conduct pointer and pull request steps survive in the kept file
- [x] #3 GitHub's contributing link shows the kept file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Kept the root file's content as .github/CONTRIBUTING.md (GitHub prefers .github/), replacing the stale one. Carried over the code of conduct pointer and the pull request steps. Updated the links in README.md, cmd/noskills-server/README.md and the noskillsserverfx quickstart, and dropped the root CONTRIBUTING.md exclude from .eser/manifest.yml.

Later the generic parts of both CONTRIBUTING files moved to pkg/@eserstack/directives/03-contributing.md, and the Citizen Code of Conduct and Contributor Covenant 3.0 merged into pkg/@eserstack/directives/01-social.md. .github/CONTRIBUTING.md links to both and keeps only the eser/stack setup; .github/CODE_OF_CONDUCT.md points to 01-social.md.
<!-- SECTION:NOTES:END -->
